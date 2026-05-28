import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'

async function findHomeSystemKey(gameId: string, playerId: string, db: SupabaseClient): Promise<string | null> {
  const { data: pl } = await db.from('game_players').select('faction').eq('id', playerId).maybeSingle()
  if (!pl) return null
  const faction = (pl as Record<string, string>).faction
  const { data: game } = await db.from('games').select('map_tiles').eq('id', gameId).maybeSingle()
  if (!game) return null
  const mapTiles = (game as Record<string, unknown>).map_tiles as Record<string, { faction?: string }> | null
  if (!mapTiles) return null
  for (const [key, tile] of Object.entries(mapTiles)) {
    if (tile?.faction === faction) return key
  }
  return null
}

async function spendResourcesForSecondaryTech(
  gameId: string,
  playerId: string,
  selections: Record<string, unknown>,
  db: SupabaseClient
): Promise<void> {
  const planetIds = (selections.tech_resource_planet_ids as string[]) ?? []
  const tradeGoods = (selections.tech_trade_goods as number) ?? 0
  let total = tradeGoods
  if (planetIds.length > 0) {
    const { data: pRows } = await db.from('planets').select('resources').in('name', planetIds)
    total += ((pRows ?? []) as Array<{ resources: number }>).reduce((sum, p) => sum + (p.resources ?? 0), 0)
    for (const pid of planetIds) {
      await db.from('game_player_planets').update({ exhausted: true }).eq('game_id', gameId).eq('planet_name', pid)
    }
  }
  if (total < 4) throw Object.assign(new Error('Insufficient resources for technology'), { status: 409 })
  if (tradeGoods > 0) {
    const { data: player } = await db.from('game_players').select('trade_goods').eq('id', playerId).maybeSingle()
    if (player) {
      await db
        .from('game_players')
        .update({ trade_goods: Math.max(0, (player as { trade_goods: number }).trade_goods - tradeGoods) })
        .eq('id', playerId)
    }
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; play_id?: unknown; ability_definition_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.play_id || typeof body.play_id !== 'string') return errorResponse("'play_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // STRATEGY_PLAY
  const { data: play, error: playError } = await db
    .from('game_strategy_card_plays')
    .select('id, played_by_player_id, card_number, free_secondary_player_ids')
    .eq('game_id', body.game_id)
    .eq('id', body.play_id)
    .eq('status', 'active')
    .maybeSingle()
  if (playError) return errorResponse('Database error', 500)
  if (!play) return errorResponse('No active strategy card play', 409)

  if ((play as Record<string, unknown>).played_by_player_id === (player as Record<string, unknown>).id) {
    return errorResponse('Cannot use your own secondary', 409)
  }

  // NEXT_RESPONDER — find minimum initiative_order pending response
  const { data: nextResponse, error: nextError } = await db
    .from('game_strategy_card_responses')
    .select('id, player_id')
    .eq('play_id', body.play_id)
    .eq('status', 'pending')
    .order('initiative_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (nextError) return errorResponse('Database error', 500)
  if (!nextResponse) return errorResponse('No pending responses', 409)
  if ((nextResponse as Record<string, unknown>).player_id !== (player as Record<string, unknown>).id) {
    return errorResponse('Not your turn', 409)
  }

  // Validate ability belongs to this card's secondary
  const { data: abilitySource, error: sourceError } = await db
    .from('ability_sources')
    .select('strategy_card_num')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'strategy_card')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!abilitySource) return errorResponse('Ability not found', 404)
  if ((abilitySource as Record<string, unknown>).strategy_card_num !== (play as Record<string, unknown>).card_number) {
    return errorResponse('Ability does not belong to this strategy card', 409)
  }

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    selections,
    gameRound: (game as Record<string, unknown>).round as number,
  }
  const extraResponse: Record<string, unknown> = {}

  try {
    const cardNum = (play as Record<string, unknown>).card_number as number
    switch (cardNum) {
      case 1: { // Leadership secondary — spend token + optional influence for tokens
        if ((selections.influence_planet_ids as string[] | undefined)?.length ?? 0 > 0) {
          await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'spend_influence_for_tokens' }], context, db)
        } else {
          await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        }
        break
      }
      case 2: { // Diplomacy secondary — spend token + ready up to 2 planets
        const planetsToReady = (selections.planets_to_ready as string[] | undefined) ?? []
        if (planetsToReady.length > 2) return errorResponse('Cannot ready more than 2 planets', 409)
        await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'ready_planets' }], context, db)
        break
      }
      case 3: { // Politics secondary — spend token + draw 2 action cards
        await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'draw_action_card' }, { op: 'draw_action_card' }], context, db)
        break
      }
      case 4: { // Construction secondary — spend token + activate system + place structure
        if (!selections.system_coords || !selections.planet_id || !selections.unit_type) {
          return errorResponse('system_coords, planet_id, and unit_type are required', 409)
        }
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        await db.from('game_system_activations').insert({
          game_id: body.game_id,
          player_id: (player as Record<string, string>).id,
          system_key: selections.system_coords,
          round: (game as Record<string, unknown>).round,
          token_owner_id: (player as Record<string, string>).id,
        })
        const sub: ResolveContext = {
          ...context,
          selections: { planet_name: selections.planet_id, structure_type: selections.unit_type, choices: true },
        }
        await interpretEffects([{ op: 'place_structure' }], sub, db)
        break
      }
      case 5: { // Trade secondary — replenish commodities; free if in free_secondary_player_ids
        const freeIds = ((play as Record<string, unknown>).free_secondary_player_ids as string[] | null) ?? []
        const isFree = freeIds.includes((player as Record<string, string>).id)
        if (!isFree) {
          await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        }
        await interpretEffects([{ op: 'replenish_commodities', target: 'self' }], context, db)
        break
      }
      case 6: { // Warfare secondary — spend token + return home system key
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        const homeSystemKey = await findHomeSystemKey(body.game_id, (player as Record<string, string>).id, db)
        extraResponse.home_system_key = homeSystemKey
        break
      }
      case 7: { // Technology secondary — spend token + 4 resources + research 1 tech
        if (!selections.tech_id) return errorResponse('tech_id is required', 409)
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        await spendResourcesForSecondaryTech(body.game_id, (player as Record<string, string>).id, selections, db)
        const ctx: ResolveContext = { ...context, selections: { technology_name: selections.tech_id } }
        await interpretEffects([{ op: 'gain_technology' }], ctx, db)
        break
      }
      case 8: { // Imperial secondary — spend token + draw 1 secret objective
        await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'draw_secret_objective' }], context, db)
        break
      }
      default:
        return errorResponse('Unknown strategy card number', 409)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }

  const { error: markUsedError } = await db
    .from('game_strategy_card_responses')
    .update({ status: 'used', responded_at: new Date().toISOString() })
    .eq('id', (nextResponse as Record<string, string>).id)
  if (markUsedError) return errorResponse(`Failed to update response: ${markUsedError.message}`, 500)

  const { count: remaining, error: countError } = await db
    .from('game_strategy_card_responses')
    .select('id', { count: 'exact', head: true })
    .eq('play_id', body.play_id)
    .eq('status', 'pending')
  if (countError) return errorResponse('Database error', 500)

  const playComplete = (remaining ?? 0) === 0
  if (playComplete) {
    const { error: completeError } = await db
      .from('game_strategy_card_plays')
      .update({ status: 'complete' })
      .eq('id', body.play_id)
    if (completeError) return errorResponse(`Failed to complete play: ${completeError.message}`, 500)
  }

  return okResponse({ responded: true, play_complete: playComplete, ...extraResponse })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
