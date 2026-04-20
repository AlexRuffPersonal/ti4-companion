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
  let body: { game_id?: unknown; transaction_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.transaction_id || typeof body.transaction_id !== 'string') return errorResponse("'transaction_id' is required")

  const { data: fromPlayer, error: fromPlayerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (fromPlayerError) return errorResponse('Database error', 500)
  if (!fromPlayer) return errorResponse('Player not found', 404)

  const { data: tx, error: txError } = await db
    .from('game_transactions')
    .select('from_player_id, status')
    .eq('id', body.transaction_id)
    .maybeSingle()
  if (txError) return errorResponse('Database error', 500)
  if (!tx) return errorResponse('Transaction not found', 404)

  if (tx.from_player_id !== fromPlayer.id) return errorResponse('Only recipient can rescind', 403)
  if (tx.status !== 'pending') return errorResponse('Only pending transactions can be rejected', 409)

  const { error: updateError } = await db
    .from('game_transactions')
    .update({ status: 'rescinded' })
    .eq('id', body.transaction_id)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ rescinded: true })
}
if (typeof Deno !== 'undefined') Deno.serve(handler)