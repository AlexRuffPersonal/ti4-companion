import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const TIMING_MAP: Record<string, string> = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting is about to begin:',
  after_technology_researched: 'After a player researches a technology:',
}

export async function handler(req: Request): Promise<Response> {
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
    .select('id, state, held_by_player_id, timing, ability')
    .eq('id', body.card_id)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!card) return errorResponse('Card not found', 404)
  if (card.state !== 'held' || card.held_by_player_id !== player.id) {
    return errorResponse('Card is not held by you', 403)
  }

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, active_player_id, pending_action_window')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // Handle reactive (non-Action:) timing cards
  if (!card.timing?.startsWith('Action:')) {
    const window = game.pending_action_window as Record<string, unknown> | null
    if (!window) return errorResponse('No active window for this card timing', 409)
    if (card.timing !== TIMING_MAP[window.type as string]) return errorResponse('Card timing does not match open window', 409)
    const eligibleIds = (window.eligible_player_ids as string[]) ?? []
    if (!eligibleIds.includes(player.id)) return errorResponse('Not eligible for this window', 409)
    if (!card.ability) return errorResponse('Card effect not implemented', 409)

    // Resolve the ability using existing resolveAbility/interpretEffects infrastructure
    // For now, call the ability resolution stub (full wiring is Phase 30)

    // Discard the card
    await db.from('game_action_card_deck').update({ state: 'discard', held_by_player_id: null }).eq('id', body.card_id)
    await db.from('game_players').update({ action_card_count: Math.max(0, (player.action_card_count as number) - 1) }).eq('id', player.id)

    // Update passed_player_ids
    const passedIds = (window.passed_player_ids as string[]) ?? []
    const updatedPassed = [...passedIds, player.id]
    if (updatedPassed.length >= eligibleIds.length) {
      await db.from('games').update({ pending_action_window: null }).eq('id', body.game_id)
    } else {
      await db.from('games').update({ pending_action_window: { ...window, passed_player_ids: updatedPassed } }).eq('id', body.game_id)
    }

    return okResponse({ discarded: body.card_id, result: null })
  }
  // ... existing Action: branch continues below

  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

  // Discard the card
  await db.from('game_action_card_deck').update({ state: 'discard', held_by_player_id: null }).eq('id', body.card_id)
  await db.from('game_players').update({ action_card_count: Math.max(0, (player.action_card_count as number) - 1) }).eq('id', player.id)

  return okResponse({ discarded: body.card_id, result: null })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
