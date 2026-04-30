import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; play_id?: unknown; ability_definition_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.play_id || typeof body.play_id !== 'string') return errorResponse("'play_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // STRATEGY_PLAY
  const { data: play, error: playError } = await db
    .from('game_strategy_card_plays')
    .select('id, played_by_player_id, card_number')
    .eq('game_id', body.game_id)
    .eq('id', body.play_id)
    .eq('status', 'active')
    .maybeSingle()
  if (playError) return errorResponse('Database error', 500)
  if (!play) return errorResponse('No active strategy card play', 409)

  if ((play as Record<string, unknown>).played_by_player_id === (player as Record<string, unknown>).id) {
    return errorResponse('Cannot use your own secondary', 409)
  }

  // NEXT_RESPONDER — find minimum initiative_order pending response
  const { data: nextResponse, error: nextError } = await db
    .from('game_strategy_card_responses')
    .select('id, player_id')
    .eq('play_id', body.play_id)
    .eq('status', 'pending')
    .order('initiative_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (nextError) return errorResponse('Database error', 500)
  if (!nextResponse) return errorResponse('No pending responses', 409)
  if ((nextResponse as Record<string, unknown>).player_id !== (player as Record<string, unknown>).id) {
    return errorResponse('Not your turn', 409)
  }

  // Validate ability belongs to this card's secondary
  const { data: abilitySource, error: sourceError } = await db
    .from('ability_sources')
    .select('strategy_card_num')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'strategy_card')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!abilitySource) return errorResponse('Ability not found', 404)
  if ((abilitySource as Record<string, unknown>).strategy_card_num !== (play as Record<string, unknown>).card_number) {
    return errorResponse('Ability does not belong to this strategy card', 409)
  }

  const { data: ability, error: abilityError } = await db
    .from('ability_definitions')
    .select('effects')
    .eq('id', body.ability_definition_id)
    .maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability definition not found', 404)

  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    selections,
  }

  try {
    await interpretEffects(((ability as Record<string, unknown>).effects ?? []) as unknown[], context, db)
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }

  const { error: markUsedError } = await db
    .from('game_strategy_card_responses')
    .update({ status: 'used', responded_at: new Date().toISOString() })
    .eq('id', (nextResponse as Record<string, string>).id)
  if (markUsedError) return errorResponse(`Failed to update response: ${markUsedError.message}`, 500)

  const { count: remaining, error: countError } = await db
    .from('game_strategy_card_responses')
    .select('id', { count: 'exact', head: true })
    .eq('play_id', body.play_id)
    .eq('status', 'pending')
  if (countError) return errorResponse('Database error', 500)

  const playComplete = (remaining ?? 0) === 0
  if (playComplete) {
    const { error: completeError } = await db
      .from('game_strategy_card_plays')
      .update({ status: 'complete' })
      .eq('id', body.play_id)
    if (completeError) return errorResponse(`Failed to complete play: ${completeError.message}`, 500)
  }

  return okResponse({ responded: true, play_complete: playComplete })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
