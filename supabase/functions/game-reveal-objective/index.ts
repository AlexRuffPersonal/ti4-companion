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

  let body: { game_id?: unknown; stage?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  const stage = Number(body.stage)
  if (!body.stage || ![1, 2].includes(stage)) return errorResponse("'stage' must be 1 or 2")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can reveal objectives', 403)

  // Get reference IDs for this stage
  const { data: stageObjs, error: stageError } = await db
    .from('public_objectives')
    .select('id')
    .eq('stage', stage)
  if (stageError) return errorResponse('Database error', 500)
  const stageIds = (stageObjs ?? []).map((o: { id: string }) => o.id)
  if (stageIds.length === 0) return errorResponse('No objectives found for this stage', 404)

  // Find the deck card with the lowest position
  const { data: deckCard, error: deckError } = await db
    .from('game_public_objectives')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .in('objective_id', stageIds)
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) return errorResponse('Database error', 500)
  if (!deckCard) return errorResponse('No more objectives to reveal for this stage', 409)

  const { error: updateError } = await db
    .from('game_public_objectives')
    .update({ state: 'revealed', revealed_at_round: game.round })
    .eq('id', deckCard.id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ revealed: true })
})
