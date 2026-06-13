import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent } from '../_shared/gameEvents.ts'

const EVT_REMOVE_BOT = 'remove_bot'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; bot_player_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.bot_player_id || typeof body.bot_player_id !== 'string') return errorResponse("'bot_player_id' is required")

  const gameId = body.game_id
  const botPlayerId = body.bot_player_id

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('status, host_user_id')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  if (game.status !== 'lobby') return errorResponse('Game already started', 409)
  if (userId !== game.host_user_id) return errorResponse('Not host', 403)

  const { data: botRow } = await db
    .from('game_players')
    .select('id, is_bot, faction')
    .eq('id', botPlayerId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!botRow) return errorResponse('Bot not found', 404)
  if (!botRow.is_bot) return errorResponse('Not a bot', 409)

  await db
    .from('game_players')
    .delete()
    .eq('id', botPlayerId)

  await logEvent(db, {
    game_id: gameId,
    player_id: player.id,
    event_type: EVT_REMOVE_BOT,
    payload: { bot_player_id: botPlayerId, faction: botRow.faction },
    round: 0,
    phase: 'lobby',
  })

  return okResponse({ removed: botPlayerId })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
