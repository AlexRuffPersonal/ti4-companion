import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXHAUSTABLE_TECHS } from '../_shared/techEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const selections = (body.selections ?? {}) as Record<string, unknown>

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, active_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)
  if (!game.active_player_id) return errorResponse('No active player', 409)

  const { data: callerPlayer, error: callerError } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, second_action_available')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (callerError) return errorResponse('Database error', 500)
  if (!callerPlayer) return errorResponse('Player not found in this game', 404)
  if (callerPlayer.id !== game.active_player_id) return errorResponse('Not your turn', 403)

  const technologies = (callerPlayer.technologies ?? []) as string[]
  const exhaustedTechs = (callerPlayer.exhausted_technologies ?? []) as string[]
  const secondActionAvailable = callerPlayer.second_action_available as boolean ?? false

  // Fleet Logistics: grant a second action on first end-turn call
  if (technologies.includes('Fleet Logistics') && !secondActionAvailable) {
    await db.from('game_players').update({ second_action_available: true }).eq('id', callerPlayer.id)
    return okResponse({ second_action_available: true })
  }
  // Clear second action flag before ending turn normally
  if (secondActionAvailable) {
    await db.from('game_players').update({ second_action_available: false }).eq('id', callerPlayer.id)
  }

  // Bio-Stims: exhaust at end of turn to ready 1 planet or technology
  if (
    technologies.includes('Bio-Stims') &&
    !exhaustedTechs.includes('Bio-Stims') &&
    selections.bio_stims_target
  ) {
    const target = selections.bio_stims_target as { type: string; name: string }
    if (target.type === 'planet') {
      await db.from('game_player_planets')
        .update({ exhausted: false })
        .eq('game_id', body.game_id)
        .eq('player_id', callerPlayer.id)
        .eq('planet_name', target.name)
      await db.from('game_players')
        .update({ exhausted_technologies: [...exhaustedTechs, 'Bio-Stims'] })
        .eq('id', callerPlayer.id)
    } else if (target.type === 'technology') {
      const withoutTarget = exhaustedTechs.filter(t => t !== target.name)
      await db.from('game_players')
        .update({ exhausted_technologies: [...withoutTarget, 'Bio-Stims'] })
        .eq('id', callerPlayer.id)
    }
  }

  void EXHAUSTABLE_TECHS

  // Auto-pass any pending secondary responses for the caller's active strategy card play
  const { data: activePay } = await db
    .from('game_strategy_card_plays')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('played_by_player_id', callerPlayer.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activePay) {
    await db
      .from('game_strategy_card_responses')
      .update({ status: 'passed', responded_at: new Date().toISOString() })
      .eq('play_id', (activePay as Record<string, string>).id)
      .eq('status', 'pending')
    await db
      .from('game_strategy_card_plays')
      .update({ status: 'complete' })
      .eq('id', (activePay as Record<string, string>).id)
  }

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, strategy_card, passed')
    .eq('game_id', body.game_id)
    .order('strategy_card', { ascending: true, nullsFirst: false })
  if (playersError) return errorResponse('Database error', 500)

  // Advance to next non-passed player in initiative cycle (wraps around)
  const nonPassed = (players ?? []).filter(p => !p.passed)
  let nextPlayerId: string | null = null
  if (nonPassed.length > 0) {
    const currentIndex = nonPassed.findIndex(p => p.id === callerPlayer.id)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % nonPassed.length
    nextPlayerId = nonPassed[nextIndex].id
  }

  const { error: updateError } = await db
    .from('games')
    .update({ active_player_id: nextPlayerId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
