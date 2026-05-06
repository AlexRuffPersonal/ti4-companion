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

  const result = await db.rpc('draw_action_card', { p_game_id: body.game_id, p_user_id: userId })
  if (result.error) {
    if (result.error.message?.includes('player_not_found')) return errorResponse('Player not found in this game', 404)
    if (result.error.message?.includes('deck_empty')) return errorResponse('Action card deck is empty', 409)
    return errorResponse('Database error', 500)
  }

  return okResponse({ drawn: true })
})
