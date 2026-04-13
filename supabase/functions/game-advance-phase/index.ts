import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
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
    .select('id, host_user_id, phase, round')
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
    // Action → Status: clear active player, ready all planets
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

  } else {
    // Status → Strategy: new round — reset passed, strategy cards, increment round
    const { error: playersError } = await db
      .from('game_players')
      .update({ passed: false, strategy_card: null, strategy_card_2: null })
      .eq('game_id', body.game_id)
    if (playersError) return errorResponse(`Failed to reset players: ${playersError.message}`, 500)

    const { error } = await db
      .from('games')
      .update({ phase: 'strategy', round: game.round + 1, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
  }

  return okResponse({ advanced: true })
})
