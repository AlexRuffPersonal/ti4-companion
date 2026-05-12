import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXPLORATION_EFFECTS } from '../_shared/explorationEffects.ts'
import { applyAbility, ResolveContext } from '../_shared/abilityDsl.ts'

type FrontierCardRow = {
  id: string
  name: string
  state: string
  deck_position: number
}

type SystemStateRow = {
  id: string
  has_frontier_token: boolean
  ion_storm: boolean | null
  wormhole_type: string | null
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

  const game_id = body.game_id
  const player_id = body.player_id
  const system_key = body.system_key

  const { data: game, error: gameError } = await db
    .from('games')
    .select('phase, map_tiles')
    .eq('id', game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: playerTechRow, error: techError } = await db
    .from('game_players')
    .select('technologies')
    .eq('id', player_id)
    .maybeSingle()
  if (techError) return errorResponse('Database error', 500)
  const playerTechs = (playerTechRow as { technologies: string[] } | null)?.technologies ?? []
  if (!playerTechs.includes('Dark Energy Tap')) return errorResponse('Dark Energy Tap required', 409)

  const { data: systemStateRow, error: systemError } = await db
    .from('game_system_state')
    .select('id, has_frontier_token, ion_storm, wormhole_type')
    .eq('game_id', game_id)
    .eq('system_key', system_key)
    .maybeSingle()
  if (systemError) return errorResponse('Database error', 500)
  const systemState = systemStateRow as SystemStateRow | null
  if (!systemState?.has_frontier_token) return errorResponse('No frontier token in system', 409)

  let card = await drawTopFrontierCard(game_id)

  if (!card) {
    const { data: discards, error: discardFetchError } = await db
      .from('game_exploration_decks')
      .select('id')
      .eq('game_id', game_id)
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

    card = await drawTopFrontierCard(game_id)
    if (!card) return errorResponse('Frontier deck empty', 409)
  }

  const ops = EXPLORATION_EFFECTS[card.name]
  if (!ops) return errorResponse('Unknown frontier card', 409)

  const resolveContext: ResolveContext = {
    gameId: game_id,
    activatingPlayerId: player_id,
  }

  if (card.name === 'Mirage') {
    const { error: mirageError } = await db
      .from('game_player_planets')
      .upsert(
        { game_id, player_id, planet_name: 'mirage', tile_id: null, exhausted: false, explored: false },
        { onConflict: 'game_id,player_id,planet_name' }
      )
    if (mirageError) return errorResponse('Database error', 500)
  } else if (card.name === 'Ion Storm' || card.name === 'Gamma Relay' || card.name === 'Gamma Wormhole') {
    const tokenType = (ops[0] as { op: string; token_type: string }).token_type
    if (systemState) {
      const updates: Record<string, unknown> = {}
      if (tokenType === 'ion_storm') updates.ion_storm = true
      else if (tokenType === 'gamma_wormhole') updates.wormhole_type = 'gamma'
      if (Object.keys(updates).length > 0) {
        const { error } = await db
          .from('game_system_state')
          .update(updates)
          .eq('id', systemState.id)
        if (error) return errorResponse('Database error', 500)
      }
    } else {
      const insert: Record<string, unknown> = { game_id, system_key }
      if (tokenType === 'ion_storm') insert.ion_storm = true
      else if (tokenType === 'gamma_wormhole') insert.wormhole_type = 'gamma'
      const { error } = await db.from('game_system_state').insert(insert)
      if (error) return errorResponse('Database error', 500)
    }
  } else if (card.name === 'Enigmatic Device' || card.name === 'Unknown Relic Fragment') {
    const { error: holdError } = await db
      .from('game_exploration_decks')
      .update({ state: 'held', resolved_by_player_id: player_id })
      .eq('id', card.id)
    if (holdError) return errorResponse('Database error', 500)
  } else {
    try {
      await applyAbility(ops, resolveContext, db)
    } catch (e) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message, err.status ?? 409)
    }
  }

  if (card.name !== 'Enigmatic Device' && card.name !== 'Unknown Relic Fragment') {
    const { error: discardError } = await db
      .from('game_exploration_decks')
      .update({ state: 'discarded' })
      .eq('id', card.id)
    if (discardError) return errorResponse('Database error', 500)
  }

  const { error: frontierError } = await db
    .from('game_system_state')
    .update({ has_frontier_token: false })
    .eq('game_id', game_id)
    .eq('system_key', system_key)
  if (frontierError) return errorResponse('Database error', 500)

  return okResponse({ card_name: card.name })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
