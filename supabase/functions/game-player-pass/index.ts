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
    .select('id, phase, active_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)
  if (!game.active_player_id) return errorResponse('No active player', 409)

  const { data: callerPlayer, error: callerError } = await db
    .from('game_players')
    .select('id, strategy_card')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (callerError) return errorResponse('Database error', 500)
  if (!callerPlayer) return errorResponse('Player not found in this game', 404)
  if (callerPlayer.id !== game.active_player_id) return errorResponse('Not your turn', 403)

  // Mark as passed
  const { error: passError } = await db
    .from('game_players')
    .update({ passed: true })
    .eq('id', callerPlayer.id)
  if (passError) return errorResponse(`Update failed: ${passError.message}`, 500)

  // Fetch updated player list (caller now has passed=true in DB)
  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, strategy_card, passed')
    .eq('game_id', body.game_id)
    .order('strategy_card', { ascending: true, nullsFirst: false })
  if (playersError) return errorResponse('Database error', 500)

  // Find next non-passed player in initiative order after the one who just passed
  const nonPassed = (players ?? []).filter(p => !p.passed)
  let nextPlayerId: string | null = null
  if (nonPassed.length > 0) {
    const afterCurrent = nonPassed.find(
      p => (p.strategy_card ?? 99) > (callerPlayer.strategy_card ?? 0)
    )
    nextPlayerId = (afterCurrent ?? nonPassed[0]).id
  }

  const { error: updateError } = await db
    .from('games')
    .update({ active_player_id: nextPlayerId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ passed: true })
})
