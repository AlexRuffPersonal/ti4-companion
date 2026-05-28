import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXPLORATION_EFFECTS, Op } from '../_shared/explorationEffects.ts'
import { applyAbility, ResolveContext } from '../_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../_shared/relicEffects.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ExplorationCardRow = {
  id: string
  game_id: string
  deck_type: string
  state: string
  deck_position: number | null
  name: string
  text: string | null
  has_attachment: boolean
  relic_fragment_type: string | null
  resolved_by_player_id: string | null
  planet_name: string | null
}

type ResolveExplorationContext = {
  gameId: string
  playerId: string
  planetName: string | null
  systemKey: string | null
  choice: number | undefined
  removeInfantry: boolean | undefined
}

/**
 * Dispatch exploration-specific ops that abilityDsl.ts doesn't handle.
 * Returns true if the op was handled here, false if it should fall through to applyAbility.
 */
async function dispatchExplorationOp(
  op: Op,
  ctx: ResolveExplorationContext,
  card: ExplorationCardRow,
  resolveContext: ResolveContext,
  dbClient: SupabaseClient
): Promise<'handled' | 'passthrough' | 'relic_fragment' | 'attachment' | Response> {
  switch (op.op) {
    case 'choice': {
      const options = op.options as Op[][]
      const chosenIndex = ctx.choice ?? 0
      const chosen = options[chosenIndex]
      if (!chosen) return 'handled'
      const choicePassthrough: Op[] = []
      for (const innerOp of chosen) {
        const result = await dispatchExplorationOp(innerOp, ctx, card, resolveContext, dbClient)
        if (result instanceof Response) return result
        if (result === 'passthrough') choicePassthrough.push(innerOp)
      }
      if (choicePassthrough.length > 0) {
        await applyAbility(choicePassthrough, resolveContext, dbClient)
      }
      return 'handled'
    }

    case 'attach_to_planet': {
      return 'attachment'
    }

    case 'gain_relic_fragment': {
      return 'relic_fragment'
    }

    case 'hold_card': {
      return 'relic_fragment'
    }

    case 'conditional_mech_or_infantry': {
      const { data: units } = await dbClient
        .from('game_player_units')
        .select('id, unit_type, count')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.playerId)
        .eq('on_planet', ctx.planetName)
      const unitList = (units ?? []) as Array<{ id: string; unit_type: string; count: number }>
      const hasMechOrInfantry = unitList.some(
        (u) => (u.unit_type === 'mech' || u.unit_type === 'infantry') && u.count > 0
      )
      if (hasMechOrInfantry) {
        const innerEffects = op.effect as Op[]
        if (innerEffects) {
          await applyAbility(innerEffects, resolveContext, dbClient)
        }
      }
      if (ctx.removeInfantry) {
        const infantryRow = unitList.find((u) => u.unit_type === 'infantry' && u.count > 0)
        if (infantryRow) {
          const newCount = infantryRow.count - 1
          if (newCount === 0) {
            await dbClient.from('game_player_units').delete().eq('id', infantryRow.id)
          } else {
            await dbClient.from('game_player_units').update({ count: newCount }).eq('id', infantryRow.id)
          }
        }
      }
      return 'handled'
    }

    case 'place_map_token': {
      if (ctx.systemKey) {
        const tokenType = op.token_type as string
        const { data: existing } = await dbClient
          .from('game_system_state')
          .select('id, ion_storm, wormhole_type')
          .eq('game_id', ctx.gameId)
          .eq('system_key', ctx.systemKey)
          .maybeSingle()
        if (existing) {
          const updates: Record<string, unknown> = {}
          if (tokenType === 'ion_storm') updates.ion_storm = true
          else if (tokenType === 'gamma_wormhole') updates.wormhole_type = 'gamma'
          if (Object.keys(updates).length > 0) {
            await dbClient.from('game_system_state').update(updates).eq('id', (existing as { id: string }).id)
          }
        } else {
          const insert: Record<string, unknown> = { game_id: ctx.gameId, system_key: ctx.systemKey }
          if (tokenType === 'ion_storm') insert.ion_storm = true
          else if (tokenType === 'gamma_wormhole') insert.wormhole_type = 'gamma'
          await dbClient.from('game_system_state').insert(insert)
        }
      }
      return 'handled'
    }

    case 'place_mirage': {
      return errorResponse('Mirage placement not yet implemented', 409)
    }

    default:
      return 'passthrough'
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_id?: unknown
    player_id?: unknown
    card_id?: unknown
    choice?: unknown
    remove_infantry?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")

  const game_id = body.game_id
  const player_id = body.player_id
  const card_id = body.card_id
  const choice = typeof body.choice === 'number' ? body.choice : undefined
  const removeInfantry = typeof body.remove_infantry === 'boolean' ? body.remove_infantry : undefined

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game } = await db
    .from('games')
    .select('phase, map_tiles')
    .eq('id', game_id)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const { data: cardRow, error: cardError } = await db
    .from('game_exploration_decks')
    .select('id, game_id, deck_type, state, deck_position, name, text, has_attachment, relic_fragment_type, resolved_by_player_id, planet_name')
    .eq('id', card_id)
    .eq('game_id', game_id)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!cardRow) return errorResponse('Card not found', 404)

  const card = cardRow as ExplorationCardRow

  if (card.state !== 'drawn') return errorResponse('Card not in drawn state', 409)
  if (card.resolved_by_player_id !== player_id) return errorResponse('Not your card', 409)

  const ops = EXPLORATION_EFFECTS[card.name]
  if (!ops) return errorResponse('Unknown exploration card', 409)

  const planetName = card.planet_name
  const systemKey: string | null = null

  const explorationCtx: ResolveExplorationContext = {
    gameId: game_id,
    playerId: player_id,
    planetName,
    systemKey,
    choice,
    removeInfantry,
  }

  const resolveContext: ResolveContext = {
    gameId: game_id,
    activatingPlayerId: player_id,
    targetPlanetName: planetName ?? undefined,
    chosenOption: choice,
  }

  let signalType: 'handled' | 'passthrough' | 'relic_fragment' | 'attachment' = 'handled'
  const passthroughOps: Op[] = []

  for (const op of ops) {
    const result = await dispatchExplorationOp(op, explorationCtx, card, resolveContext, db)
    if (result instanceof Response) return result
    if (result === 'passthrough') {
      passthroughOps.push(op)
    } else if (result === 'relic_fragment') {
      signalType = 'relic_fragment'
    } else if (result === 'attachment') {
      signalType = 'attachment'
    }
  }

  if (passthroughOps.length > 0) {
    try {
      await applyAbility(passthroughOps, resolveContext, db)
    } catch (e) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message, err.status ?? 409)
    }
  }

  if (resolveContext.gainedRelicName) {
    try {
      await applyOnGainRelicEffect(resolveContext.gainedRelicName, game_id, player_id, db)
    } catch (e) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message ?? 'Failed to apply relic effect', err.status ?? 500)
    }
  }

  if (signalType === 'relic_fragment') {
    const { error: updateError } = await db
      .from('game_exploration_decks')
      .update({ state: 'held', resolved_by_player_id: player_id })
      .eq('id', card_id)
    if (updateError) return errorResponse('Database error', 500)
  } else {
    const { error: updateError } = await db
      .from('game_exploration_decks')
      .update({ state: 'discarded', resolved_by_player_id: null })
      .eq('id', card_id)
    if (updateError) return errorResponse('Database error', 500)
  }

  if (planetName) {
    const { error: exploreError } = await db
      .from('game_player_planets')
      .update({ explored: true })
      .eq('game_id', game_id)
      .eq('player_id', player_id)
      .eq('planet_name', planetName)
    if (exploreError) return errorResponse('Database error', 500)
  }

  return okResponse({ applied: card.name })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
