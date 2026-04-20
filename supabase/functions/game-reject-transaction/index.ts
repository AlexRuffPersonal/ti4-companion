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

  const { data: toPlayer, error: toPlayerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (toPlayerError) return errorResponse('Database error', 500)
  if (!toPlayer) return errorResponse('Player not found', 404)

  const { data: tx, error: txError } = await db
    .from('game_transactions')
    .select('to_player_id, status')
    .eq('id', body.transaction_id)
    .maybeSingle()
  if (txError) return errorResponse('Database error', 500)
  if (!tx) return errorResponse('Transaction not found', 404)

  if (tx.to_player_id !== toPlayer.id) return errorResponse('Only recipient can reject', 403)
  if (tx.status !== 'pending') return errorResponse('Only pending transactions can be rejected', 409)

  const { error: updateError } = await db
    .from('game_transactions')
    .update({ status: 'rejected' })
    .eq('id', body.transaction_id)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ rejected: true })
}
if (typeof Deno !== 'undefined') Deno.serve(handler)