import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_CREATE_TRANSACTION } from '../_shared/gameEvents.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; to_player_id?: unknown; offer?: unknown; request?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.to_player_id || typeof body.to_player_id !== 'string') return errorResponse("'to_player_id' is required")
  if (!body.offer || typeof body.offer !== 'object') return errorResponse("'offer' is required")
  if (!body.request || typeof body.request !== 'object') return errorResponse("'request' is required")

  const offer = body.offer as { commodities?: number; trade_goods?: number; note_ids?: string[] }
  const request = body.request as { commodities?: number; trade_goods?: number; note_ids?: string[] }

  // Validate note counts
  if ((offer.note_ids?.length ?? 0) > 1 || (request.note_ids?.length ?? 0) > 1) {
    return errorResponse('Max 1 note per side', 409)
  }

  // Get current player
  const { data: fromPlayer, error: fromPlayerError } = await db
    .from('game_players')
    .select('id, commodities, trade_goods')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .single()
  if (fromPlayerError) return errorResponse('Database error', 500)
  if (!fromPlayer) return errorResponse('Player not found in game', 404)

  const fromPlayerId = fromPlayer.id

  // Validate to_player_id is different
  if (body.to_player_id === fromPlayerId) {
    return errorResponse('Cannot trade with yourself', 409)
  }

  // Validate to_player exists
  const { data: toPlayer, error: toPlayerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('id', body.to_player_id)
    .maybeSingle()
  if (toPlayerError) return errorResponse('Database error', 500)
  if (!toPlayer) return errorResponse('Target player not in game', 404)

  // Get game for current_vote_sequence
  const { data: game, error: gameError } = await db
    .from('games')
    .select('current_vote_sequence')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // Validate commodities/trade_goods availability
  if ((offer.commodities ?? 0) > (fromPlayer.commodities ?? 0)) {
    return errorResponse('Insufficient commodities', 409)
  }
  if ((offer.trade_goods ?? 0) > (fromPlayer.trade_goods ?? 0)) {
    return errorResponse('Insufficient trade goods', 409)
  }

  // Validate offered notes are held by caller
  if ((offer.note_ids?.length ?? 0) > 0) {
    const { data: heldNotes, error: heldNotesError } = await db
      .from('game_player_promissory_notes')
      .select('id, state, held_by_player_id')
      .eq('game_id', body.game_id)
      .eq('held_by_player_id', fromPlayerId)
      .eq('state', 'held')
    if (heldNotesError) return errorResponse('Database error', 500)

    const heldNoteIds = (heldNotes ?? []).map(n => n.id)
    for (const noteId of (offer.note_ids ?? [])) {
      if (!heldNoteIds.includes(noteId)) {
        return errorResponse('Note is not held by you or is not in held state', 409)
      }
    }
  }

  // Agenda phase: check for duplicate confirmed transaction at this vote_sequence
  const { data: existingTx, error: existingTxError } = await db
    .from('game_transactions')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('from_player_id', fromPlayerId)
    .eq('to_player_id', body.to_player_id)
    .eq('vote_sequence_at_creation', game.current_vote_sequence)
    .eq('status', 'confirmed')
  if (existingTxError) return errorResponse('Database error', 500)
  if ((existingTx ?? []).length > 0) {
    return errorResponse('Already confirmed a transaction with this player at this vote sequence', 409)
  }

  // Create transaction
  const { error: insertError } = await db
    .from('game_transactions')
    .insert({
      game_id: body.game_id,
      from_player_id: fromPlayerId,
      to_player_id: body.to_player_id,
      items: {
        offer: {
          commodities: offer.commodities ?? 0,
          trade_goods: offer.trade_goods ?? 0,
          note_ids: offer.note_ids ?? [],
        },
        request: {
          commodities: request.commodities ?? 0,
          trade_goods: request.trade_goods ?? 0,
          note_ids: request.note_ids ?? [],
        },
      },
      status: 'pending',
      vote_sequence_at_creation: game.current_vote_sequence,
    })
  if (insertError) return errorResponse(`Failed to create transaction: ${insertError.message}`, 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: fromPlayerId,
    event_type: EVT_CREATE_TRANSACTION,
    payload: { from_player_id: fromPlayerId, to_player_id: body.to_player_id, offer: body.offer },
    round: 0,
    phase: 'action',
  })
  return okResponse({ created: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)