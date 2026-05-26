import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'

async function fetchTopAgendaCards(
  gameId: string,
  n: number,
  db: SupabaseClient
): Promise<Array<{ id: string; name: string; text: string }>> {
  const { data } = await db
    .from('game_agenda_deck')
    .select('agenda_cards(id, name, text)')
    .eq('game_id', gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(n)
  return ((data ?? []) as Array<{ agenda_cards: { id: string; name: string; text: string } }>)
    .map((row) => row.agenda_cards)
    .filter(Boolean)
}

async function spendResourcesForTech(
  gameId: string,
  playerId: string,
  selections: Record<string, unknown>,
  db: SupabaseClient
): Promise<void> {
  const planetIds = (selections.tech_2_resource_planet_ids as string[]) ?? []
  const tradeGoods = (selections.tech_2_trade_goods as number) ?? 0
  let total = tradeGoods
  if (planetIds.length > 0) {
    const { data: pRows } = await db.from('planets').select('resources').in('name', planetIds)
    total += ((pRows ?? []) as Array<{ resources: number }>).reduce((sum, p) => sum + (p.resources ?? 0), 0)
    for (const pid of planetIds) {
      await db.from('game_player_planets').update({ exhausted: true }).eq('game_id', gameId).eq('planet_name', pid)
    }
  }
  if (total < 6) throw Object.assign(new Error('Insufficient resources for second technology'), { status: 409 })
  if (tradeGoods > 0) {
    const { data: pl } = await db.from('game_players').select('trade_goods').eq('id', playerId).maybeSingle()
    if (pl) {
      await db
        .from('game_players')
        .update({ trade_goods: Math.max(0, (pl as { trade_goods: number }).trade_goods - tradeGoods) })
        .eq('id', playerId)
    }
  }
}

async function playerControlsMecatol(gameId: string, playerId: string, db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from('game_player_planets')
    .select('planet_name')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .eq('planet_name', 'Mecatol Rex')
    .maybeSingle()
  return data !== null
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; ability_definition_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, strategy_card, seat_index')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, active_player_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

  const { data: abilitySource, error: sourceError } = await db
    .from('ability_sources')
    .select('strategy_card_num')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'strategy_card')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!abilitySource) return errorResponse('Ability not found', 404)
  if ((abilitySource as Record<string, unknown>).strategy_card_num !== player.strategy_card) {
    return errorResponse('Card not held by caller', 409)
  }

  const { data: existingPlay, error: playQueryError } = await db
    .from('game_strategy_card_plays')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('round', game.round)
    .eq('status', 'active')
    .maybeSingle()
  if (playQueryError) return errorResponse('Database error', 500)
  if (existingPlay) return errorResponse('Strategy card already being played', 409)

  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id as string,
    activatingPlayerId: (player as Record<string, string>).id,
    selections,
    gameRound: (game as Record<string, unknown>).round as number,
  }
  const extraResponse: Record<string, unknown> = {}

  try {
    const cardNum = (player as Record<string, unknown>).strategy_card as number
    switch (cardNum) {
      case 1: { // Leadership — gain 3 tokens + optional influence spend
        await interpretEffects([{ op: 'gain_command_tokens', bucket: 'tactic_total', amount: 3 }], context, db)
        const influencePlanets = (selections.influence_planet_ids as string[] | undefined) ?? []
        if (influencePlanets.length > 0) {
          await interpretEffects([{ op: 'spend_influence_for_tokens' }], context, db)
        }
        break
      }
      case 2: { // Diplomacy — lock system + ready planets
        if (!selections.target_system_coords) return errorResponse('target_system_coords required', 409)
        const planetsToReady = (selections.planets_to_ready as string[] | undefined) ?? []
        if (planetsToReady.length > 2) return errorResponse('Cannot ready more than 2 planets', 409)
        await interpretEffects([{ op: 'diplomacy_lock_system' }, { op: 'ready_planets' }], context, db)
        break
      }
      case 3: { // Politics — peek top 2 agendas, draw 2 action cards, change speaker
        if (!selections.new_speaker_player_id) return errorResponse('new_speaker_player_id required', 409)
        const orderedCardIds = selections.ordered_card_ids as string[] | undefined
        if (!orderedCardIds || orderedCardIds.length !== 2) return errorResponse('ordered_card_ids must have 2 entries', 409)
        const peekCards = await fetchTopAgendaCards(body.game_id as string, 2, db)
        await interpretEffects([
          { op: 'set_speaker' },
          { op: 'draw_action_card' },
          { op: 'draw_action_card' },
          { op: 'peek_agenda', count: 2 },
        ], context, db)
        extraResponse.peek_cards = peekCards
        break
      }
      case 4: { // Construction — place 1-2 structures
        const structures = (selections.structures as Array<{ planet_id: string; unit_type: string }> | undefined) ?? []
        if (structures.length === 0) return errorResponse('At least one structure required', 409)
        for (const s of structures.slice(0, 2)) {
          const sub: ResolveContext = {
            ...context,
            selections: { planet_name: s.planet_id, structure_type: s.unit_type, choices: true },
          }
          await interpretEffects([{ op: 'place_structure' }], sub, db)
        }
        break
      }
      case 5: { // Trade — gain 3 TGs, replenish commodities
        await interpretEffects([
          { op: 'gain_trade_goods', amount: 3 },
          { op: 'replenish_commodities', target: 'self' },
        ], context, db)
        break
      }
      case 6: { // Warfare — remove board token + redistribute
        if (!selections.remove_from_system_coords) return errorResponse('remove_from_system_coords required', 409)
        const tokens = selections.tokens as Record<string, unknown> | undefined
        if (!tokens) return errorResponse('Token redistribution values required', 409)
        const total =
          ((tokens.tactic_total as number) ?? 0) +
          ((tokens.fleet as number) ?? 0) +
          ((tokens.strategy as number) ?? 0)
        if (total > 16) return errorResponse('Token redistribution exceeds maximum', 409)
        await interpretEffects([{ op: 'warfare_remove_board_token' }, { op: 'warfare_redistribute_tokens' }], context, db)
        break
      }
      case 7: { // Technology — research 1 free, optional 2nd for 6 resources
        if (!selections.tech_1_id) return errorResponse('tech_1_id required', 409)
        const ctx1: ResolveContext = { ...context, selections: { technology_name: selections.tech_1_id } }
        await interpretEffects([{ op: 'gain_technology' }], ctx1, db)
        if (selections.tech_2_id) {
          await spendResourcesForTech(body.game_id as string, (player as Record<string, string>).id, selections, db)
          const ctx2: ResolveContext = { ...context, selections: { technology_name: selections.tech_2_id } }
          await interpretEffects([{ op: 'gain_technology' }], ctx2, db)
        }
        break
      }
      case 8: { // Imperial — score public objective + Mecatol VP or draw secret objective
        if (selections.public_objective_id) {
          await interpretEffects([{ op: 'score_public_objective' }], context, db)
        }
        const hasMecatol = await playerControlsMecatol(body.game_id as string, (player as Record<string, string>).id, db)
        if (hasMecatol) {
          await interpretEffects([{ op: 'score_imperial_point' }], context, db)
        } else {
          await interpretEffects([{ op: 'draw_secret_objective' }], context, db)
        }
        break
      }
      default:
        return errorResponse('Unknown strategy card number', 409)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }

  const { data: play, error: insertPlayError } = await db
    .from('game_strategy_card_plays')
    .insert({
      game_id: body.game_id,
      card_number: player.strategy_card,
      played_by_player_id: (player as Record<string, string>).id,
      round: game.round,
      status: 'active',
    })
    .select('id')
    .single()
  if (insertPlayError) return errorResponse(`Failed to create play: ${insertPlayError.message}`, 500)

  // Post-creation: update free_secondary for Trade card
  if ((player as Record<string, unknown>).strategy_card === 5) {
    const freeSecondaryIds = (selections.free_secondary_player_ids as string[] | undefined) ?? []
    if (freeSecondaryIds.length > 0) {
      await db
        .from('game_strategy_card_plays')
        .update({ free_secondary_player_ids: freeSecondaryIds })
        .eq('id', (play as Record<string, string>).id)
    }
  }

  const { data: allPlayers, error: playersError } = await db
    .from('game_players')
    .select('id, seat_index')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)

  const playerCount = (allPlayers ?? []).length
  const otherPlayers = (allPlayers ?? []).filter((p: Record<string, unknown>) => p.id !== player.id)
  const responseRows = otherPlayers.map((other: Record<string, unknown>) => ({
    play_id: (play as Record<string, string>).id,
    player_id: other.id,
    initiative_order: ((other.seat_index as number) - (player.seat_index as number) + playerCount) % playerCount,
    status: 'pending',
  }))

  if (responseRows.length > 0) {
    const { error: insertResponsesError } = await db
      .from('game_strategy_card_responses')
      .insert(responseRows)
    if (insertResponsesError) return errorResponse(`Failed to create responses: ${insertResponsesError.message}`, 500)
  }

  const { pendingWindows } = await applyCommanderPassives(
    'STRATEGY_TOKEN_SPENT',
    {
      gameId: body.game_id as string,
      activatingPlayerId: (player as Record<string, string>).id,
    } as never,
    db,
  )

  return okResponse({ play_id: (play as Record<string, string>).id, ...extraResponse, pending_window: pendingWindows[0] ?? undefined })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
