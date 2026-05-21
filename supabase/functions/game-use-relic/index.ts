import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyAbility } from '../_shared/abilityDsl.ts'
import { RELIC_EFFECTS } from '../_shared/relicEffects.ts'

const ACTION_RELICS = ['Stellar Converter', 'The Codex']

type RelicRow = {
  id: string
  game_id: string
  relic_id: string
  held_by_player_id: string | null
  exhausted: boolean
  state: string
}

type RelicDef = {
  id: string
  name: string
  purge_on_use: boolean
  exhaustable: boolean
  text: string
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
    relic_id?: unknown
    choice?: unknown
    use_type?: unknown
    planet_name?: unknown
    deck_type?: unknown
    card_ids?: unknown
    technology_name?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.relic_id || typeof body.relic_id !== 'string') return errorResponse("'relic_id' is required")

  const gameId = body.game_id
  const playerId = body.player_id
  const relicId = body.relic_id
  const choice = typeof body.choice === 'number' ? body.choice : null
  const useType = typeof body.use_type === 'string' ? body.use_type : null
  const planetName = typeof body.planet_name === 'string' ? body.planet_name : null
  const deckType = typeof body.deck_type === 'string' ? body.deck_type : null
  const cardIds = Array.isArray(body.card_ids) ? body.card_ids as string[] : null
  const technologyName = typeof body.technology_name === 'string' ? body.technology_name : null

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const playerRow = player as { id: string }

  const { data: game, error: gameError } = await db
    .from('games')
    .select('phase, active_player_id')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const gameRow = game as { phase: string; active_player_id: string }

  const { data: relicRow, error: relicRowError } = await db
    .from('game_relic_deck')
    .select('id, game_id, relic_id, held_by_player_id, exhausted, state')
    .eq('id', relicId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (relicRowError) return errorResponse('Database error', 500)
  if (!relicRow) return errorResponse('Relic not found', 404)

  const relic = relicRow as RelicRow

  if (relic.held_by_player_id !== playerId) return errorResponse('Relic not owned by player', 409)
  if (relic.exhausted) return errorResponse('Relic already exhausted', 409)
  if (relic.state === 'purged') return errorResponse('Relic already purged', 409)

  const { data: relicDef, error: relicDefError } = await db
    .from('relics')
    .select('id, name, purge_on_use, exhaustable, text')
    .eq('id', relic.relic_id)
    .maybeSingle()
  if (relicDefError) return errorResponse('Database error', 500)
  if (!relicDef) return errorResponse('Relic definition not found', 404)

  const def = relicDef as RelicDef

  if (ACTION_RELICS.includes(def.name)) {
    if (gameRow.active_player_id !== playerRow.id) {
      return errorResponse('Not your turn', 409)
    }
  }

  // Maw Of Worlds: agenda phase gate
  if (def.name === 'Maw Of Worlds') {
    if (gameRow.phase !== 'agenda') {
      return errorResponse('Not agenda phase', 409)
    }
  }

  // Crown Of Emphidia: two paths via use_type
  if (def.name === 'The Crown Of Emphidia' && useType === 'purge_for_vp') {
    if (gameRow.phase !== 'status') {
      return errorResponse('Not status phase', 409)
    }
    const { data: tomb, error: tombError } = await db
      .from('game_player_planets')
      .select('id')
      .eq('game_id', gameId)
      .eq('player_id', playerRow.id)
      .eq('planet_name', 'Tomb of Emphidia')
      .maybeSingle()
    if (tombError) return errorResponse('Database error', 500)
    if (!tomb) return errorResponse('Tomb of Emphidia not controlled', 409)

    const { data: playerVpRow, error: vpFetchError } = await db
      .from('game_players')
      .select('vp')
      .eq('id', playerRow.id)
      .maybeSingle()
    if (vpFetchError || !playerVpRow) return errorResponse('Database error', 500)
    const { error: vpError } = await db
      .from('game_players')
      .update({ vp: (playerVpRow as { vp: number }).vp + 1 })
      .eq('id', playerRow.id)
    if (vpError) return errorResponse('Database error', 500)

    const { error: purgeError } = await db
      .from('game_relic_deck')
      .update({ state: 'purged' })
      .eq('id', relicId)
    if (purgeError) return errorResponse('Database error', 500)

    return okResponse({ applied: 'The Crown Of Emphidia', effect: 'purge_for_vp' })
  }

  const ops = RELIC_EFFECTS[def.name]
  if (ops === undefined) return errorResponse('Unknown relic', 409)

  const context = {
    gameId,
    activatingPlayerId: playerRow.id,
    chosenOption: choice ?? undefined,
    relicId,
    phase: gameRow.phase,
    selections: {
      ...(planetName ? { planet_name: planetName } : {}),
      ...(deckType ? { deck_type: deckType } : {}),
      ...(cardIds ? { card_ids: cardIds } : {}),
      ...(technologyName ? { technology_name: technologyName } : {}),
    },
  }

  try {
    await applyAbility(ops, context, db)
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Failed to apply relic', err.status === 409 ? 409 : 500)
  }

  // Prophet's Tears: enrich response with chosen effect
  let effect: string | undefined
  if (def.name === "The Prophet's Tears") {
    effect = choice === 0 ? 'ignore_prerequisite' : 'draw_action_card'
  }

  if (def.name === 'Stellar Converter' && planetName) {
    const { error: deleteError } = await db
      .from('game_player_legendary_cards')
      .delete()
      .eq('game_id', gameId)
      .eq('planet_name', planetName)
    if (deleteError) return errorResponse('Database error', 500)
  }

  if (def.purge_on_use) {
    const { error: purgeError } = await db
      .from('game_relic_deck')
      .update({ state: 'purged' })
      .eq('id', relicId)
    if (purgeError) return errorResponse('Database error', 500)
  } else if (def.exhaustable) {
    const { error: exhaustError } = await db
      .from('game_relic_deck')
      .update({ exhausted: true })
      .eq('id', relicId)
    if (exhaustError) return errorResponse('Database error', 500)
  }

  return okResponse({ applied: def.name, ...(effect ? { effect } : {}) })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
