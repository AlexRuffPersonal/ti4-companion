import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getNextPlayer } from '../_shared/player-order.ts'

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
    .select('id, speaker_player_id, agenda_phase_step, agenda_current_card_id, current_vote_sequence')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // Verify caller is the speaker
  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.speaker_player_id) {
    return errorResponse('Only the speaker can draw the agenda', 403)
  }

  // Validate step allows drawing
  const validSteps = ['agenda_1_voting', 'agenda_1_resolved']
  if (!validSteps.includes(game.agenda_phase_step)) {
    return errorResponse(`Cannot draw agenda in step: ${game.agenda_phase_step}`, 409)
  }
  if (game.agenda_current_card_id) {
    return errorResponse('An agenda card is already in play', 409)
  }

  // Pull top deck card
  const { data: topCards, error: deckError } = await db
    .from('game_agenda_deck')
    .select('id, agenda_id, deck_position')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
  if (deckError) return errorResponse('Database error', 500)
  const topCard = topCards?.[0]
  if (!topCard) return errorResponse('Agenda deck is empty', 409)

  // Mark card as voting
  const { error: deckUpdateError } = await db
    .from('game_agenda_deck')
    .update({ state: 'voting' })
    .eq('id', topCard.id)
  if (deckUpdateError) return errorResponse(`Failed to update deck: ${deckUpdateError.message}`, 500)

  // Get first voter (player after speaker in reverse speaker order)
  const firstVoterId = await getNextPlayer(body.game_id, game.speaker_player_id, 'reverse_speaker', game.speaker_player_id, db)

  // Advance step if coming from agenda_1_resolved
  const newStep = game.agenda_phase_step === 'agenda_1_resolved'
    ? 'agenda_2_voting'
    : game.agenda_phase_step

  const { error: gameUpdateError } = await db
    .from('games')
    .update({
      agenda_current_card_id: topCard.agenda_id,
      agenda_vote_current_player_id: firstVoterId,
      agenda_phase_step: newStep,
      current_vote_sequence: game.current_vote_sequence + 1,
    })
    .eq('id', body.game_id)
  if (gameUpdateError) return errorResponse(`Failed to update game: ${gameUpdateError.message}`, 500)

  // Open when_agenda_revealed window if any player holds a matching action card
  const { data: eligibleRows } = await db
    .from('game_action_card_deck')
    .select('held_by_player_id, action_cards!inner(timing, ability)')
    .eq('game_id', body.game_id)
    .eq('state', 'hand')
    .eq('action_cards.timing', 'When an agenda is revealed:')
    .not('action_cards.ability', 'is', null)
  const eligibleIds = (eligibleRows ?? []).map((r: Record<string, unknown>) => r.held_by_player_id as string)
  if (eligibleIds.length > 0) {
    await db
      .from('games')
      .update({
        pending_action_window: {
          type: 'when_agenda_revealed',
          eligible_player_ids: eligibleIds,
          passed_player_ids: [],
          context: { agenda_id: topCard.agenda_id },
        },
      })
      .eq('id', body.game_id)
  }

  return okResponse({ drawn: true, agenda_id: topCard.agenda_id })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
