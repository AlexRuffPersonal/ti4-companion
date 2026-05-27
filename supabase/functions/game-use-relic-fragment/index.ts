import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyAbility } from '../_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../_shared/relicEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; player_id?: unknown; fragment_ids?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.fragment_ids || !Array.isArray(body.fragment_ids)) return errorResponse("'fragment_ids' is required and must be an array")

  const game_id = body.game_id
  const fragment_ids = body.fragment_ids as string[]

  // Fetch the player by user_id
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const player_id = (player as Record<string, string>).id

  // Fetch game to check active_player_id
  const { data: game, error: gameError } = await db
    .from('games')
    .select('active_player_id')
    .eq('id', game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // ACTIVE_PLAYER check
  if ((game as Record<string, string>).active_player_id !== player_id) {
    return errorResponse('Not your turn', 409)
  }

  // Validate fragment count
  if (fragment_ids.length !== 3) {
    return errorResponse('Must submit exactly 3 fragment IDs', 409)
  }

  // Fetch all 3 fragments
  const { data: fragments, error: fragmentsError } = await db
    .from('game_exploration_decks')
    .select('id, state, resolved_by_player_id, relic_fragment_type')
    .eq('game_id', game_id)
    .in('id', fragment_ids)
  if (fragmentsError) return errorResponse('Database error', 500)

  const fragmentList = (fragments ?? []) as Array<{
    id: string
    state: string
    resolved_by_player_id: string | null
    relic_fragment_type: string
  }>

  if (fragmentList.length !== 3) {
    return errorResponse('Fragment not found', 409)
  }

  // Validate ownership and state
  for (const frag of fragmentList) {
    if (frag.resolved_by_player_id !== player_id) {
      return errorResponse('Fragment not owned by player', 409)
    }
    if (frag.state !== 'held') {
      return errorResponse('Fragment not in hand', 409)
    }
  }

  // Validate spend combination
  const types = fragmentList.map(f => f.relic_fragment_type)
  const typedFragments = types.filter(t => t !== 'unknown')
  if (typedFragments.length === 0) {
    return errorResponse('Need at least 1 typed fragment', 409)
  }
  const leadType = typedFragments[0]
  for (const t of types) {
    if (t !== leadType && t !== 'unknown') {
      return errorResponse('Fragments must all match or be unknown', 409)
    }
  }

  // Discard all 3 fragments
  const { error: discardError } = await db
    .from('game_exploration_decks')
    .update({ state: 'discarded', resolved_by_player_id: null })
    .in('id', fragment_ids)
  if (discardError) return errorResponse(`Failed to discard fragments: ${discardError.message}`, 500)

  // Draw a relic
  try {
    const context = { gameId: game_id, activatingPlayerId: player_id }
    await applyAbility([{ op: 'gain_relic' }], context, db)
    if (context.gainedRelicName) {
      await applyOnGainRelicEffect(context.gainedRelicName, game_id, player_id, db)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Failed to gain relic', err.status === 409 ? 409 : 500)
  }

  return okResponse({ relic_gained: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
