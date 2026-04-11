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

  let body: { game_id?: unknown; vp_goal?: unknown; expansions?: unknown; permissions_mode?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can update settings', 403)
  if (game.status !== 'lobby') return errorResponse('Game has already started', 409)

  const updates: Record<string, unknown> = {}

  if (body.vp_goal !== undefined) {
    if (typeof body.vp_goal !== 'number' || body.vp_goal < 1) {
      return errorResponse("'vp_goal' must be a positive integer")
    }
    updates.vp_goal = body.vp_goal
  }
  if (body.expansions !== undefined) {
    if (typeof body.expansions !== 'object' || body.expansions === null) {
      return errorResponse("'expansions' must be an object")
    }
    updates.expansions = body.expansions
  }
  if (body.permissions_mode !== undefined) {
    if (!['host', 'all'].includes(body.permissions_mode as string)) {
      return errorResponse("'permissions_mode' must be 'host' or 'all'")
    }
    updates.permissions_mode = body.permissions_mode
  }

  if (Object.keys(updates).length === 0) return errorResponse('No valid fields to update')

  const { error: updateError } = await db.from('games').update(updates).eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
