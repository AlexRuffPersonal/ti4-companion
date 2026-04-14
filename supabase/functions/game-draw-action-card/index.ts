import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
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

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: topCard, error: deckError } = await db
    .from('game_action_card_deck')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) return errorResponse('Database error', 500)
  if (!topCard) return errorResponse('Action card deck is empty', 409)

  const { error: updateCardError } = await db
    .from('game_action_card_deck')
    .update({ state: 'held', held_by_player_id: player.id, deck_position: null })
    .eq('id', topCard.id)
  if (updateCardError) return errorResponse('Database error', 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ action_card_count: player.action_card_count + 1 })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse('Database error', 500)

  return okResponse({ drawn: true })
})
