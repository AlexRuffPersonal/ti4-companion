import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, dslError } from '../_shared/abilityDsl.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; card_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")

  const gameId = body.game_id
  const selections = (body.selections ?? {}) as Record<string, unknown>

  const { data: player } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('phase, active_player_id, round')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  if (game.phase !== 'action') return errorResponse('Not the action phase', 409)
  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)

  // Fetch the card from the player's hand
  const { data: deckRow } = await db
    .from('game_action_card_deck')
    .select('id, action_card_id, state, held_by_player_id, action_cards!inner(id, name, timing, ability)')
    .eq('id', body.card_id)
    .eq('held_by_player_id', player.id)
    .eq('state', 'hand')
    .maybeSingle()
  if (!deckRow) return errorResponse('Card not in hand', 404)

  const card = (deckRow as Record<string, unknown>).action_cards as Record<string, unknown>
  const timing = card?.timing as string | null
  const ability = card?.ability as unknown[] | null

  if (!timing?.startsWith('Action:')) return errorResponse('Card timing is not Action:', 409)
  if (!ability) return errorResponse('Card effect not implemented', 409)

  let result: unknown
  try {
    await interpretEffects(ability, { gameId, activatingPlayerId: player.id as string, selections }, db)
    result = { resolved: true }
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return errorResponse((err as Error).message, status)
  }

  // Discard card
  await db
    .from('game_action_card_deck')
    .update({ state: 'discard', held_by_player_id: null })
    .eq('id', body.card_id)

  await db
    .from('game_players')
    .update({ action_card_count: Math.max(0, ((player as Record<string, number>).action_card_count ?? 1) - 1) })
    .eq('id', player.id)

  // End player's action turn: mark as passed, advance active player
  await db
    .from('game_players')
    .update({ passed: true })
    .eq('id', player.id)

  const { data: nextPlayers } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('passed', false)
    .order('initiative_order', { ascending: true })
    .limit(1)

  const nextPlayerId = (nextPlayers as Array<{ id: string }> | null)?.[0]?.id ?? null

  await db
    .from('games')
    .update({ active_player_id: nextPlayerId })
    .eq('id', gameId)

  return okResponse({ discarded: body.card_id, result })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
