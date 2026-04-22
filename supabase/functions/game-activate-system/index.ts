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

  let body: { game_id?: unknown; system_key?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, command_tokens')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('active_player_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not the active player', 409)

  const tokens = player.command_tokens as { tactic_total: number }
  const tacticTotal = tokens?.tactic_total ?? 0

  const { data: activations, error: activationError } = await db
    .from('game_system_activations')
    .select('id, system_key')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('round', game.round)
  if (activationError) return errorResponse('Database error', 500)

  const usedTactics = (activations ?? []).length
  if (usedTactics >= tacticTotal) return errorResponse('No tactic tokens available', 409)

  const alreadyActivated = (activations ?? []).some(
    (a: { id: string; system_key: string }) => a.system_key === body.system_key
  )
  if (alreadyActivated) return errorResponse('System already activated by you this round', 409)

  const { error: insertError } = await db
    .from('game_system_activations')
    .insert({
      game_id: body.game_id,
      player_id: player.id,
      system_key: body.system_key,
      round: game.round,
      token_owner_id: player.id,
    })
  if (insertError) return errorResponse(`Failed to activate system: ${insertError.message}`, 500)

  return okResponse({ activated: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)