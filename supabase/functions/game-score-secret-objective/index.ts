import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_SCORE_SECRET } from '../_shared/gameEvents.ts'
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../_shared/objectiveConditions.ts'

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
    .select('id, vp, secret_objective_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: row, error: rowError } = await db
    .from('game_player_secret_objectives')
    .select('id, state, player_id, secret_objectives(timing, condition_check)')
    .eq('id', body.objective_id)
    .maybeSingle()
  if (rowError) return errorResponse('Database error', 500)
  if (!row) return errorResponse('Secret objective not found', 404)
  if (row.state !== 'held') return errorResponse('Objective is not held', 409)
  if (row.player_id !== player.id) return errorResponse('You do not hold this objective', 403)

  const timing = (row.secret_objectives as { timing: string; condition_check?: unknown } | null)?.timing
  if (timing && timing !== game.phase) {
    return errorResponse(`Cannot score: objective timing '${timing}' does not match current phase '${game.phase}'`, 409)
  }

  const { count: scoredCount, error: scoredCountError } = await db
    .from('game_player_secret_objectives')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .eq('state', 'scored')
    .eq('scored_at_round', game.round)
  if (scoredCountError) return errorResponse('Database error', 500)
  if ((scoredCount ?? 0) > 0) {
    return errorResponse('You have already scored a secret objective this round', 409)
  }

  // Get condition_check from secret_objectives reference via the join
  const refObjData = row.secret_objectives as { timing: string; condition_check?: unknown } | null
  const conditionCheck = refObjData?.condition_check ?? null

  if (conditionCheck) {
    const ctx = await buildEvaluationContext(db, body.game_id, player.id)
    const result = evaluateCondition(conditionCheck as { type: string; params: Record<string, unknown> }, ctx)
    if (!result.eligible) return errorResponse(result.reason || 'Objective condition not met', 422)
  }

  const { error: updateObjError } = await db
    .from('game_player_secret_objectives')
    .update({ state: 'scored', scored_at_round: game.round })
    .eq('id', body.objective_id)
  if (updateObjError) return errorResponse(`Update failed: ${updateObjError.message}`, 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ vp: player.vp + 1, secret_objective_count: (player.secret_objective_count ?? 0) + 1 })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse(`Update failed: ${updatePlayerError.message}`, 500)

  // Apply spend side effects after VP update
  if (conditionCheck) {
    const ctx2 = await buildEvaluationContext(db, body.game_id, player.id)
    const spendTypes = ['spend_resources', 'spend_influence', 'spend_trade_goods', 'spend_command_tokens']
    const cc = conditionCheck as { type: string; params?: Record<string, unknown> }
    if (spendTypes.includes(cc.type)) {
      await applySpendSideEffect(cc.type, cc.params ?? {}, ctx2, db)
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_SCORE_SECRET,
    payload: { player_id: player.id, objective_id: body.objective_id, vp_before: player.vp, vp_after: player.vp + 1 },
    round: game.round,
    phase: game.phase,
  })
  return okResponse({ scored: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
