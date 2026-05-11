import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_DISCARD_ACTION_CARD } from '../_shared/gameEvents.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; card_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: card, error: cardError } = await db
    .from('game_action_card_deck')
    .select('id, state, held_by_player_id')
    .eq('id', body.card_id)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!card) return errorResponse('Card not found', 404)
  if (card.state !== 'held' || card.held_by_player_id !== player.id) {
    return errorResponse('Card is not held by you', 403)
  }

  const { error: updateCardError } = await db
    .from('game_action_card_deck')
    .update({ state: 'discarded', held_by_player_id: null })
    .eq('id', card.id)
  if (updateCardError) return errorResponse('Database error', 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ action_card_count: Math.max(0, player.action_card_count - 1) })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse('Database error', 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_DISCARD_ACTION_CARD,
    payload: { player_id: player.id, card_id: body.card_id },
    round: 0,
    phase: 'action',
  })
  return okResponse({ discarded: true })
})
