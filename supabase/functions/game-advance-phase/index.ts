import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, host_user_id, phase, round, agenda_unlocked')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can advance the phase', 403)
  if (!['strategy', 'action', 'status'].includes(game.phase)) {
    return errorResponse(`Cannot advance from phase: ${game.phase}`, 409)
  }

  if (game.phase === 'strategy') {
    // Strategy → Action: set active player to lowest strategy_card
    const { data: players, error: playersError } = await db
      .from('game_players')
      .select('id, strategy_card')
      .eq('game_id', body.game_id)
      .not('strategy_card', 'is', null)
      .order('strategy_card', { ascending: true })
      .limit(1)
    if (playersError) return errorResponse('Database error', 500)
    const firstPlayer = players?.[0] ?? null

    const { error } = await db
      .from('games')
      .update({ phase: 'action', active_player_id: firstPlayer?.id ?? null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  } else if (game.phase === 'action') {
    // Action → Status: clear active player
    const { error: planetsError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', body.game_id)
    if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

    const { error } = await db
      .from('games')
      .update({ phase: 'status', active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

    // Reset Sustain Damage for all units in the game
    const { error: unitsError } = await db
      .from('game_player_units')
      .update({ damaged: false })
      .eq('game_id', body.game_id)
    if (unitsError) return errorResponse(`Failed to reset damaged units: ${unitsError.message}`, 500)

  } else if (game.phase === 'status') {
    // Status phase: new round — refresh planets, reset passed, strategy cards
    const { error: planetsError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', body.game_id)
    if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

    const { error: playersError } = await db
      .from('game_players')
      .update({ passed: false, strategy_card: null, strategy_card_2: null })
      .eq('game_id', body.game_id)
    if (playersError) return errorResponse(`Failed to reset players: ${playersError.message}`, 500)

    
    // Ready legendary cards at the start of the new round
    const { error: legendaryError } = await db
      .from('game_player_legendary_cards')
      .update({ status: 'readied' })
      .eq('game_id', body.game_id)
    if (legendaryError) return errorResponse(`Failed to ready legendary cards: ${legendaryError.message}`, 500)

    // Reset movement blockers and no-move flags at the start of each new round
    if (!game.agenda_unlocked) {
      const { error: blockedError } = await db
        .from('games')
        .update({ movement_blocked_systems: [] })
        .eq('id', body.game_id)
      if (blockedError) return errorResponse(`Failed to reset movement blocks: ${blockedError.message}`, 500)

      const { error: noMoveError } = await db
        .from('game_player_units')
        .update({ no_move_this_round: false })
        .eq('game_id', body.game_id)
      if (noMoveError) return errorResponse(`Failed to reset no-move flags: ${noMoveError.message}`, 500)
    }

    const nextPhase = game.agenda_unlocked ? 'agenda' : 'strategy'
    const roundUpdate = game.agenda_unlocked ? game.round : game.round + 1

    // Reset vote_prevented when transitioning into agenda phase
    if (game.agenda_unlocked) {
      const { error: votePreventedError } = await db
        .from('game_players')
        .update({ vote_prevented: false })
        .eq('game_id', body.game_id)
      if (votePreventedError) return errorResponse(`Failed to reset vote_prevented: ${votePreventedError.message}`, 500)
    }

    const { error } = await db
      .from('games')
      .update({ phase: nextPhase, round: roundUpdate, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
  }

  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)