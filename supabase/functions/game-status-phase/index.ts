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

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, host_user_id, permissions_mode, phase, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  if (game.permissions_mode !== 'all' && game.host_user_id !== userId) {
    return errorResponse('Only the host can end the status phase', 403)
  }

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, passed, command_tokens')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)

  const allPassed = (players ?? []).every((p: { passed: boolean }) => p.passed)
  if (!allPassed) return errorResponse('Not all players have passed', 409)

  // Ready all planets
  const { error: planetsError } = await db
    .from('game_player_planets')
    .update({ exhausted: false })
    .eq('game_id', body.game_id)
  if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

  // Repair all units
  const { error: unitsError } = await db
    .from('game_player_units')
    .update({ damaged_count: 0 })
    .eq('game_id', body.game_id)
  if (unitsError) return errorResponse(`Failed to repair units: ${unitsError.message}`, 500)

  // Clear system activations
  const { error: activationsError } = await db
    .from('game_system_activations')
    .delete()
    .eq('game_id', body.game_id)
  if (activationsError) return errorResponse(`Failed to clear activations: ${activationsError.message}`, 500)

  // Grant +2 tactic to each player and reset flags
  for (const player of players ?? []) {
    const tokens = player.command_tokens as { tactic_total: number; fleet: number; strategy: number }
    const { error: playerUpdateError } = await db
      .from('game_players')
      .update({
        command_tokens: { ...tokens, tactic_total: tokens.tactic_total + 2 },
        tokens_redistributed: false,
        passed: false,
      })
      .eq('id', player.id)
    if (playerUpdateError) return errorResponse(`Failed to update player: ${playerUpdateError.message}`, 500)
  }

  // Advance round and phase
  const { error: gameUpdateError } = await db
    .from('games')
    .update({ round: game.round + 1, phase: 'strategy' })
    .eq('id', body.game_id)
  if (gameUpdateError) return errorResponse(`Failed to advance game: ${gameUpdateError.message}`, 500)

  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)