import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXPLORATION_EFFECTS, Op } from '../_shared/explorationEffects.ts'
import { applyAbility, ResolveContext } from '../_shared/abilityDsl.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type FrontierCardRow = {
  id: string
  name: string
  state: string
  deck_position: number
}

type FrontierContext = {
  gameId: string
  playerId: string
  systemKey: string
  choice: null
  removeInfantry: false
}

async function drawTopFrontierCard(game_id: string): Promise<FrontierCardRow | null> {
  const { data, error } = await db
    .from('game_exploration_decks')
    .select('id, name, state, deck_position')
    .eq('game_id', game_id)
    .eq('deck_type', 'frontier')
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data as FrontierCardRow | null
}

/**
 * Dispatch frontier-specific ops.
 * Returns 'handled' if fully resolved here,
 *         'held'    if the card should be kept in held state (not discarded),
 *         or throws/falls through to applyAbility for generic ops.
 */
async function dispatchFrontierOp(
  op: Op,
  ctx: FrontierContext,
  resolveContext: ResolveContext,
  dbClient: SupabaseClient
): Promise<'handled' | 'held'> {
  switch (op.op) {
    case 'place_mirage': {
      const { error } = await dbClient
        .from('game_player_planets')
        .upsert(
          { game_id: ctx.gameId, player_id: ctx.playerId, planet_name: 'mirage', tile_id: null, exhausted: false, explored: false },
          { onConflict: 'game_id,player_id,planet_name' }
        )
      if (error) throw Object.assign(new Error('Database error'), { status: 500 })
      return 'handled'
    }

    case 'place_map_token': {
      const tokenType = op.token_type as string
      const updates: Record<string, unknown> = { game_id: ctx.gameId, system_key: ctx.systemKey }
      if (tokenType === 'ion_storm') updates.ion_storm = true
      else if (tokenType === 'gamma_wormhole') updates.wormhole_type = 'gamma'
      const { error } = await dbClient
        .from('game_system_state')
        .upsert(updates, { onConflict: 'game_id,system_key' })
      if (error) throw Object.assign(new Error('Database error'), { status: 500 })
      return 'handled'
    }

    case 'gain_relic_fragment': {
      if (op.keep_card) {
        return 'held'
      }
      await applyAbility([op], resolveContext, dbClient)
      return 'handled'
    }

    default: {
      await applyAbility([op], resolveContext, dbClient)
      return 'handled'
    }
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

  let body: { game_id?: unknown; player_id?: unknown; system_key?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const gameId = body.game_id
  const playerId = body.player_id
  const systemKey = body.system_key

  const { data: game, error: gameError } = await db
    .from('games')
    .select('phase, map_tiles')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: playerTechRow, error: techError } = await db
    .from('game_players')
    .select('technologies')
    .eq('id', playerId)
    .maybeSingle()
  if (techError) return errorResponse('Database error', 500)
  const playerTechs = (playerTechRow as { technologies: string[] } | null)?.technologies ?? []
  if (!playerTechs.includes('Dark Energy Tap')) return errorResponse('Dark Energy Tap required', 409)

  const { data: systemStateRow, error: systemError } = await db
    .from('game_system_state')
    .select('id, has_frontier_token, ion_storm, wormhole_type')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .maybeSingle()
  if (systemError) return errorResponse('Database error', 500)
  const systemState = systemStateRow as { id: string; has_frontier_token: boolean; ion_storm: boolean | null; wormhole_type: string | null } | null
  if (!systemState?.has_frontier_token) return errorResponse('No frontier token in system', 409)

  let card = await drawTopFrontierCard(gameId)

  if (!card) {
    const { data: discards, error: discardFetchError } = await db
      .from('game_exploration_decks')
      .select('id')
      .eq('game_id', gameId)
      .eq('deck_type', 'frontier')
      .eq('state', 'discarded')
    if (discardFetchError) return errorResponse('Database error', 500)

    const discardList = (discards ?? []) as Array<{ id: string }>
    if (discardList.length === 0) return errorResponse('Frontier deck empty', 409)

    const reshuffleResults = await Promise.all(
      discardList.map((d) =>
        db.from('game_exploration_decks')
          .update({ state: 'deck', deck_position: Math.random() * 1000 })
          .eq('id', d.id)
      )
    )
    if (reshuffleResults.some((r) => r.error)) return errorResponse('Database error', 500)

    card = await drawTopFrontierCard(gameId)
    if (!card) return errorResponse('Frontier deck empty', 409)
  }

  const ops = EXPLORATION_EFFECTS[card.name]
  if (!ops) return errorResponse('Unknown frontier card', 409)

  const ctx: FrontierContext = {
    gameId,
    playerId,
    systemKey,
    choice: null,
    removeInfantry: false,
  }

  const resolveContext: ResolveContext = {
    gameId,
    activatingPlayerId: playerId,
  }

  let held = false
  try {
    for (const op of ops) {
      const result = await dispatchFrontierOp(op, ctx, resolveContext, db)
      if (result === 'held') held = true
    }
  } catch (e) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message, err.status ?? 409)
  }

  if (held) {
    const { error: holdError } = await db
      .from('game_exploration_decks')
      .update({ state: 'held', resolved_by_player_id: playerId })
      .eq('id', card.id)
    if (holdError) return errorResponse('Database error', 500)
  } else {
    const { error: discardError } = await db
      .from('game_exploration_decks')
      .update({ state: 'discarded', resolved_by_player_id: null })
      .eq('id', card.id)
    if (discardError) return errorResponse('Database error', 500)
  }

  const { error: frontierError } = await db
    .from('game_system_state')
    .upsert({ game_id: gameId, system_key: systemKey, has_frontier_token: false }, { onConflict: 'game_id,system_key' })
  if (frontierError) return errorResponse('Database error', 500)

  return okResponse({ card_name: card.name })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
