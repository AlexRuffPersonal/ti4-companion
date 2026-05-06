import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_DECK_TYPES = ['cultural', 'hazardous', 'industrial', 'frontier']

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; deck_type?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.deck_type || typeof body.deck_type !== 'string') return errorResponse("'deck_type' is required")
  if (!VALID_DECK_TYPES.includes(body.deck_type)) return errorResponse('Invalid deck_type', 400)

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: discards } = await db
    .from('game_exploration_decks')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('deck_type', body.deck_type)
    .eq('state', 'discarded')

  if (!discards || discards.length === 0) {
    return errorResponse('No discards to shuffle', 409)
  }

  // Generate a shuffled array of positions 1..n
  const n = discards.length
  const positions = Array.from({ length: n }, (_, i) => i + 1)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }

  for (let i = 0; i < discards.length; i++) {
    const discard = discards[i] as Record<string, string>
    await db
      .from('game_exploration_decks')
      .update({ state: 'deck', deck_position: positions[i] })
      .eq('id', discard.id)
  }

  return okResponse({ reshuffled: discards.length })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
