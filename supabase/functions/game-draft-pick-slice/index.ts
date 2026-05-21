import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { buildSnakeOrder } from '../_shared/draftHelpers.ts'

interface DraftSlice {
  id: string
  tiles: string[]
  score: number
  claimed_by: string | null
}

interface DraftState {
  mode: string
  phase: string
  slices: DraftSlice[]
  pick_order: string[]
  pick_index: number
  hands: Record<string, string[]>
  placement_order: string[]
  placement_index: number
  placed_tiles: Record<string, unknown>
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

  let body: { game_id?: unknown; slice_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.slice_id || typeof body.slice_id !== 'string') return errorResponse("'slice_id' is required")

  const gameId = body.game_id
  const sliceId = body.slice_id

  // Fetch game
  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, draft_state')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const ds = (game as Record<string, unknown>).draft_state as DraftState | null
  if (!ds || ds.phase !== 'slice-pick') return errorResponse('Draft is not in slice-pick phase', 409)

  // Fetch player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const playerId = (player as Record<string, string>).id

  // Check it's this player's turn to pick
  if (playerId !== ds.pick_order[ds.pick_index]) {
    return errorResponse('Not your turn to pick', 403)
  }

  // Find the slice
  const slice = ds.slices.find((s) => s.id === sliceId)
  if (!slice) return errorResponse('Slice not found', 404)

  // Check not already claimed
  if (slice.claimed_by !== null) return errorResponse('Slice already claimed', 409)

  // Claim slice
  const updatedSlices = ds.slices.map((s) =>
    s.id === sliceId ? { ...s, claimed_by: playerId } : s,
  )
  const updatedHands: Record<string, string[]> = { ...ds.hands, [playerId]: slice.tiles }
  const newPickIndex = ds.pick_index + 1

  let newPhase = 'slice-pick'
  let placementOrder = ds.placement_order

  if (newPickIndex >= ds.pick_order.length) {
    // All slices claimed — transition to placement
    // Reverse of reverse-speaker = speaker order
    const playerOrder = [...ds.pick_order].reverse()
    const allHandSizes: Record<string, number> = {}
    for (const [pid, tiles] of Object.entries(updatedHands)) {
      allHandSizes[pid] = tiles.length
    }
    placementOrder = buildSnakeOrder(playerOrder, allHandSizes)
    newPhase = 'placement'
  }

  const newDraftState: DraftState = {
    ...ds,
    slices: updatedSlices,
    hands: updatedHands,
    pick_index: newPickIndex,
    phase: newPhase,
    placement_order: placementOrder,
  }

  const { error: updateError } = await db
    .from('games')
    .update({ draft_state: newDraftState })
    .eq('id', gameId)
  if (updateError) return errorResponse(`Failed to update game: ${updateError.message}`, 500)

  return okResponse({ phase: newPhase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
