import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getUndoableEvents, applyUndo } from '../_shared/gameEvents.ts'
import { applyUndoHandler } from '../_shared/undoHandlers.ts'

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

  const gameId = body.game_id

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('host_user_id, round, phase')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  if (userId !== game.host_user_id) return errorResponse('Not host', 403)

  const events = await getUndoableEvents(db, gameId, 1)
  if (events.length === 0) return errorResponse('Nothing to undo', 409)

  const event = events[0]

  await applyUndoHandler(db, event as { event_type: string; payload: Record<string, unknown> })
  await applyUndo(db, event.id as string)

  const { data: updatedGame } = await db
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle()

  const { data: updatedPlayers } = await db
    .from('game_players')
    .select('*')
    .eq('game_id', gameId)

  return okResponse({ game: updatedGame, players: updatedPlayers, undone_event_type: event.event_type })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
