import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_CONFIRM_TRANSACTION } from '../_shared/gameEvents.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; transaction_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.transaction_id || typeof body.transaction_id !== 'string') return errorResponse("'transaction_id' is required")

  // Get caller player
  const { data: toPlayer, error: toPlayerError } = await db
    .from('game_players')
    .select('id, commodities, trade_goods')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (toPlayerError) return errorResponse('Database error', 500)
  if (!toPlayer) return errorResponse('Player not found', 404)

  // Get transaction
  const { data: tx, error: txError } = await db
    .from('game_transactions')
    .select('id, from_player_id, to_player_id, items, status, active_player_id')
    .eq('id', body.transaction_id)
    .maybeSingle()
  if (txError) return errorResponse('Database error', 500)
  if (!tx) return errorResponse('Transaction not found', 404)

  // Validate caller is to_player_id
  if (tx.to_player_id !== toPlayer.id) {
    return errorResponse('Only recipient can confirm', 403)
  }

  // Validate status is pending
  if (tx.status !== 'pending') {
    return errorResponse('Transaction is not pending', 409)
  }

  // Get game state
  const { data: game, error: gameError } = await db
    .from('games')
    .select('active_player_id, phase')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)

  // Validate one party is active
  if (game?.active_player_id !== tx.from_player_id && game?.active_player_id !== tx.to_player_id) {
    return errorResponse('One party must be the active player', 409)
  }

  // Action phase: check no existing confirmed tx for this pair on this active player's turn
  if (game?.phase === 'action') {
    const { data: existingConfirmed, error: existingError } = await db
      .from('game_transactions')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('from_player_id', tx.from_player_id)
      .eq('to_player_id', tx.to_player_id)
      .eq('active_player_id', game.active_player_id)
      .eq('status', 'confirmed')
    if (existingError) return errorResponse('Database error', 500)
    if ((existingConfirmed ?? []).length > 0) {
      return errorResponse('Already confirmed a transaction with this player on this turn', 409)
    }
  }

  const items = tx.items as {
    offer: { commodities: number; trade_goods: number; note_ids: string[] }
    request: { commodities: number; trade_goods: number; note_ids: string[] }
  }

  // Validate recipient has sufficient items for request side
  const requestCommodities = items.request.commodities ?? 0
  const requestTradeGoods = items.request.trade_goods ?? 0
  if (requestCommodities > (toPlayer.commodities ?? 0) || requestTradeGoods > (toPlayer.trade_goods ?? 0)) {
    return errorResponse('Recipient has insufficient items', 409)
  }

  // Get from_player for commodity updates
  const { data: fromPlayer, error: fromPlayerError } = await db
    .from('game_players')
    .select('id, commodities, trade_goods')
    .eq('id', tx.from_player_id)
    .maybeSingle()
  if (fromPlayerError) return errorResponse('Database error', 500)

  // Atomically execute trade
  // Step 1: sender's commodities → recipient's trade_goods (auto-convert)
  const { error: step1Error } = await db
    .from('game_players')
    .update({
      commodities: (fromPlayer?.commodities ?? 0) - (items.offer.commodities ?? 0),
      trade_goods: (fromPlayer?.trade_goods ?? 0) - (items.offer.trade_goods ?? 0),
    })
    .eq('id', tx.from_player_id)
  if (step1Error) return errorResponse('Database error', 500)

  const { error: step2Error } = await db
    .from('game_players')
    .update({
      commodities: (toPlayer.commodities ?? 0) - requestCommodities,
      trade_goods: (toPlayer.trade_goods ?? 0) + (items.offer.commodities ?? 0) + requestTradeGoods,
    })
    .eq('id', toPlayer.id)
  if (step2Error) return errorResponse('Database error', 500)

  // Mirror for request side (recipient sends to proposer)
  const { error: step3Error } = await db
    .from('game_players')
    .update({
      commodities: (fromPlayer?.commodities ?? 0) + requestCommodities,
      trade_goods: (fromPlayer?.trade_goods ?? 0) + requestTradeGoods,
    })
    .eq('id', tx.from_player_id)
  if (step3Error) return errorResponse('Database error', 500)

  // Handle note transfers
  if ((items.offer.note_ids?.length ?? 0) > 0 || (items.request.note_ids?.length ?? 0) > 0) {
    const noteIds = [...(items.offer.note_ids ?? []), ...(items.request.note_ids ?? [])]
    for (const noteId of noteIds) {
      const { data: noteRow, error: noteRowError } = await db
        .from('game_player_promissory_notes')
        .select('id, state, held_by_player_id, note_id')
        .eq('id', noteId)
        .maybeSingle()
      if (noteRowError) return errorResponse('Database error', 500)

      const isOfferNote = items.offer.note_ids?.includes(noteId)
      const recipientId = isOfferNote ? toPlayer.id : tx.from_player_id

      // Fetch note definition to check special auto-fire names
      const { data: noteDef } = await db.from('promissory_notes').select('name').eq('id', noteRow?.note_id).maybeSingle()
      const noteName = (noteDef as { name: string } | null)?.name ?? ''

      if (noteName === 'Support For The Throne') {
        // Set state='in_play' and grant recipient 1 VP
        await db.from('game_player_promissory_notes').update({ state: 'in_play', held_by_player_id: recipientId }).eq('id', noteRow?.id)
        // Fetch recipient VP and increment
        const { data: recipientPlayer } = await db.from('game_players').select('vp').eq('id', recipientId).maybeSingle()
        await db.from('game_players').update({ vp: ((recipientPlayer as { vp: number } | null)?.vp ?? 0) + 1 }).eq('id', recipientId)
      } else if (noteName === 'Alliance') {
        await db.from('game_player_promissory_notes').update({ state: 'in_play', held_by_player_id: recipientId }).eq('id', noteRow?.id)
      } else {
        // Existing behavior: state='held'
        const { error: transferError } = await db
          .from('game_player_promissory_notes')
          .update({ state: 'held', held_by_player_id: recipientId })
          .eq('id', noteId)
        if (transferError) return errorResponse('Database error', 500)
      }
    }
  }

  // Finalize transaction
  const { error: finalError } = await db
    .from('game_transactions')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      active_player_id: game?.active_player_id,
    })
    .eq('id', body.transaction_id)
  if (finalError) return errorResponse('Database error', 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: toPlayer.id,
    event_type: EVT_CONFIRM_TRANSACTION,
    payload: { transaction_id: body.transaction_id, from_player_id: tx.from_player_id, to_player_id: toPlayer.id },
    round: 0,
    phase: game?.phase ?? 'action',
  })
  return okResponse({ confirmed: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)