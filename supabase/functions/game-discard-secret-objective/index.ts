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

  let body: { game_id?: unknown; objective_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, secrets_selected')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: row, error: rowError } = await db
    .from('game_player_secret_objectives')
    .select('id, state, player_id')
    .eq('id', body.objective_id)
    .maybeSingle()
  if (rowError) return errorResponse('Database error', 500)
  if (!row) return errorResponse('Secret objective not found', 404)
  if (row.state !== 'held') return errorResponse('Objective is not held', 409)
  if (row.player_id !== player.id) return errorResponse('You do not hold this objective', 403)

  const { count: deckSize, error: countError } = await db
    .from('game_player_secret_objectives')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
  if (countError) return errorResponse('Database error', 500)

  const deckCount = deckSize ?? 0
  const deckPosition = Math.floor(Math.random() * (deckCount + 1))

  const { error: updateError } = await db
    .from('game_player_secret_objectives')
    .update({ state: 'deck', player_id: null, deck_position: deckPosition })
    .eq('id', body.objective_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  if (!player.secrets_selected) {
    const { error: flagError } = await db
      .from('game_players')
      .update({ secrets_selected: true })
      .eq('id', player.id)
    if (flagError) return errorResponse(`Update failed: ${flagError.message}`, 500)
  }

  return okResponse({ discarded: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)