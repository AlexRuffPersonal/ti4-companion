import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_SCORE_OBJECTIVE } from '../_shared/gameEvents.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; objective_id?: unknown; player_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can score objectives', 403)

  // objective_id is the game_public_objectives row id
  const { data: gameObj, error: objError } = await db
    .from('game_public_objectives')
    .select('id, objective_id, state, scored_by')
    .eq('id', body.objective_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (objError) return errorResponse('Database error', 500)
  if (!gameObj) return errorResponse('Objective not found in this game', 404)
  if (gameObj.state !== 'revealed') return errorResponse('Objective has not been revealed yet', 409)
  if ((gameObj.scored_by ?? []).includes(body.player_id)) {
    return errorResponse('Player has already scored this objective', 409)
  }

  // Get point value from reference table
  const { data: refObj, error: refError } = await db
    .from('public_objectives')
    .select('points')
    .eq('id', gameObj.objective_id)
    .single()
  if (refError) return errorResponse('Database error', 500)
  const points = refObj?.points ?? 1

  // Append player to scored_by
  const { error: updateObjError } = await db
    .from('game_public_objectives')
    .update({ scored_by: [...(gameObj.scored_by ?? []), body.player_id] })
    .eq('id', body.objective_id)
  if (updateObjError) return errorResponse(`Update failed: ${updateObjError.message}`, 500)

  // Increment VP
  const { data: player, error: playerFetchError } = await db
    .from('game_players')
    .select('vp')
    .eq('id', body.player_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (playerFetchError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { error: vpError } = await db
    .from('game_players')
    .update({ vp: player.vp + points })
    .eq('id', body.player_id)
  if (vpError) return errorResponse(`VP update failed: ${vpError.message}`, 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: body.player_id,
    event_type: EVT_SCORE_OBJECTIVE,
    payload: { player_id: body.player_id, objective_id: body.objective_id, vp_before: player.vp, vp_after: player.vp + points },
    round: 0,
    phase: 'status',
  })
  return okResponse({ scored: true, vp_awarded: points })
})
