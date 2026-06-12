import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent } from '../_shared/gameEvents.ts'

const EVT_ADD_BOT = 'add_bot'
const VALID_BOT_STRATEGIES = ['random', 'scripted']

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; display_name?: unknown; faction?: unknown; color?: unknown; bot_strategy?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.display_name || typeof body.display_name !== 'string') return errorResponse("'display_name' is required")
  if (!body.faction || typeof body.faction !== 'string') return errorResponse("'faction' is required")
  if (!body.color || typeof body.color !== 'string') return errorResponse("'color' is required")
  if (!body.bot_strategy || typeof body.bot_strategy !== 'string') return errorResponse("'bot_strategy' is required")

  const gameId = body.game_id
  const displayName = body.display_name
  const faction = body.faction
  const color = body.color
  const botStrategy = body.bot_strategy

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
  if (!VALID_BOT_STRATEGIES.includes(botStrategy)) return errorResponse('Invalid bot_strategy', 400)

  const { data: factionConflict } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('faction', faction)
    .maybeSingle()
  if (factionConflict) return errorResponse('Faction taken', 409)

  const { data: colorConflict } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('colour', color)
    .maybeSingle()
  if (colorConflict) return errorResponse('Color taken', 409)

  const { count } = await db
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
  const seatIndex = (count ?? 0) + 1

  const { data: newRow, error: insertError } = await db
    .from('game_players')
    .insert({
      game_id: gameId,
      user_id: null,
      display_name: displayName,
      faction,
      colour: color,
      bot_strategy: botStrategy,
      is_bot: true,
      seat_index: seatIndex,
    })
    .select('id')
    .single()
  if (insertError || !newRow) return errorResponse(insertError?.message ?? 'Failed to create bot player', 500)

  await logEvent(db, {
    game_id: gameId,
    player_id: player.id,
    event_type: EVT_ADD_BOT,
    payload: { display_name: displayName, faction, color, bot_strategy: botStrategy },
    round: 0,
    phase: 'lobby',
  })

  return okResponse({ id: newRow.id, display_name: displayName, faction, color, bot_strategy: botStrategy, is_bot: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
