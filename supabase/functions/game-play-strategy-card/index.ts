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

  let body: { game_id?: unknown; ability_definition_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, strategy_card, seat_index')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, active_player_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

  const { data: abilitySource, error: sourceError } = await db
    .from('ability_sources')
    .select('strategy_card_num')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'strategy_card')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!abilitySource) return errorResponse('Ability not found', 404)
  if ((abilitySource as Record<string, unknown>).strategy_card_num !== player.strategy_card) {
    return errorResponse('Card not held by caller', 409)
  }

  const { data: existingPlay, error: playQueryError } = await db
    .from('game_strategy_card_plays')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('round', game.round)
    .eq('status', 'active')
    .maybeSingle()
  if (playQueryError) return errorResponse('Database error', 500)
  if (existingPlay) return errorResponse('Strategy card already being played', 409)

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

  const { data: play, error: insertPlayError } = await db
    .from('game_strategy_card_plays')
    .insert({
      game_id: body.game_id,
      card_number: player.strategy_card,
      played_by_player_id: (player as Record<string, string>).id,
      round: game.round,
      status: 'active',
    })
    .select('id')
    .single()
  if (insertPlayError) return errorResponse(`Failed to create play: ${insertPlayError.message}`, 500)

  const { data: allPlayers, error: playersError } = await db
    .from('game_players')
    .select('id, seat_index')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)

  const playerCount = (allPlayers ?? []).length
  const otherPlayers = (allPlayers ?? []).filter((p: Record<string, unknown>) => p.id !== player.id)
  const responseRows = otherPlayers.map((other: Record<string, unknown>) => ({
    play_id: (play as Record<string, string>).id,
    player_id: other.id,
    initiative_order: ((other.seat_index as number) - (player.seat_index as number) + playerCount) % playerCount,
    status: 'pending',
  }))

  if (responseRows.length > 0) {
    const { error: insertResponsesError } = await db
      .from('game_strategy_card_responses')
      .insert(responseRows)
    if (insertResponsesError) return errorResponse(`Failed to create responses: ${insertResponsesError.message}`, 500)
  }

  return okResponse({ play_id: (play as Record<string, string>).id })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
