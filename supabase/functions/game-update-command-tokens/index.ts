import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_UPDATE_COMMAND_TOKENS } from '../_shared/gameEvents.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; tactic_total?: unknown; fleet?: unknown; strategy?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const tactic = Number(body.tactic_total)
  const fleet = Number(body.fleet)
  const strategy = Number(body.strategy)
  if (isNaN(tactic) || isNaN(fleet) || isNaN(strategy)) {
    return errorResponse("'tactic_total', 'fleet', and 'strategy' must be numbers")
  }
  if (tactic < 0 || fleet < 0 || strategy < 0) return errorResponse('Token counts cannot be negative')
  if (tactic + fleet + strategy > 16) return errorResponse('Total command tokens cannot exceed 16')

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, command_tokens')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { tactic_total: tactic, fleet, strategy }, tokens_redistributed: true })
    .eq('id', player.id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_UPDATE_COMMAND_TOKENS,
    payload: { player_id: player.id, tokens_before: player.command_tokens, tokens_after: { tactic_total: tactic, fleet, strategy } },
    round: 0,
    phase: 'action',
  })
  return okResponse({ updated: true })
})
