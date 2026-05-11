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

  let body: { game_id?: unknown; system_key?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const gameId = body.game_id
  const systemKey = body.system_key

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('round')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  // ACTIVATION: caller must have activated this system this round
  const { data: activation } = await db
    .from('game_system_activations')
    .select('*')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('round', game.round)
    .maybeSingle()
  if (!activation) return errorResponse('System not activated by caller', 409)

  // Reject if any bombardment row still has unassigned hits
  const { data: pending } = await db
    .from('game_combats')
    .select('id, phase')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('combat_type', 'bombardment')
    .eq('phase', 'bombardment_assign')
  if ((pending ?? []).length > 0) {
    return errorResponse('Unresolved bombardment hits — assign before advancing', 409)
  }

  // Set bombardment_done on this activation row
  await db
    .from('game_system_activations')
    .update({ bombardment_done: true })
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('round', game.round)

  return okResponse({ ok: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
