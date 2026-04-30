import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; play_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.play_id || typeof body.play_id !== 'string') return errorResponse("'play_id' is required")

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
    .select('id, played_by_player_id')
    .eq('game_id', body.game_id)
    .eq('id', body.play_id)
    .eq('status', 'active')
    .maybeSingle()
  if (playError) return errorResponse('Database error', 500)
  if (!play) return errorResponse('No active strategy card play', 409)

  if ((play as Record<string, unknown>).played_by_player_id === (player as Record<string, unknown>).id) {
    return errorResponse('Cannot pass your own secondary', 409)
  }

  // NEXT_RESPONDER
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

  const { error: markPassedError } = await db
    .from('game_strategy_card_responses')
    .update({ status: 'passed', responded_at: new Date().toISOString() })
    .eq('id', (nextResponse as Record<string, string>).id)
  if (markPassedError) return errorResponse(`Failed to update response: ${markPassedError.message}`, 500)

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

  return okResponse({ passed: true, play_complete: playComplete })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
