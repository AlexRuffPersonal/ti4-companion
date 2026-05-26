import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_ADVANCE_PHASE } from '../_shared/gameEvents.ts'
import { applyStatusPhaseLaws } from '../_shared/lawEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, host_user_id, phase, round, agenda_unlocked')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can advance the phase', 403)
  if (!['strategy', 'action', 'status'].includes(game.phase)) {
    return errorResponse(`Cannot advance from phase: ${game.phase}`, 409)
  }

  if (game.phase === 'strategy') {
    // Strategy → Action: set active player to lowest strategy_card

    // Check for Quantum Datahub Node
    const { data: allPlayers, error: allPlayersError } = await db
      .from('game_players')
      .select('id, technologies')
      .eq('game_id', body.game_id)
    if (allPlayersError) return errorResponse('Database error', 500)

    const qdnPlayers = (allPlayers ?? []).filter((p: { technologies?: string[] }) =>
      (p.technologies ?? []).includes('Quantum Datahub Node')
    )
    if (qdnPlayers.length > 0) {
      const { error: windowError } = await db
        .from('games')
        .update({
          pending_action_window: {
            type: 'strategy_phase_end',
            eligible_player_ids: qdnPlayers.map((p: { id: string }) => p.id),
            passed_player_ids: [],
            context: { effect: 'quantum_datahub_node' },
          },
        })
        .eq('id', body.game_id)
      if (windowError) return errorResponse(`Update failed: ${windowError.message}`, 500)
    }

    const { data: players, error: playersError } = await db
      .from('game_players')
      .select('id, strategy_card')
      .eq('game_id', body.game_id)
      .not('strategy_card', 'is', null)
      .order('strategy_card', { ascending: true })
      .limit(1)
    if (playersError) return errorResponse('Database error', 500)
    const firstPlayer = players?.[0] ?? null

    const { error } = await db
      .from('games')
      .update({ phase: 'action', active_player_id: firstPlayer?.id ?? null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

    // Reset Minister of War unlock at the start of each action phase
    const { error: mowError } = await db
      .from('game_players')
      .update({ minister_of_war_unlocked: false })
      .eq('game_id', body.game_id)
    if (mowError) return errorResponse(`Failed to reset minister_of_war_unlocked: ${mowError.message}`, 500)

  } else if (game.phase === 'action') {
    // Action → Status: clear active player
    const { error: planetsError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', body.game_id)
    if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

    // Check for Wormhole Generator
    const { data: allPlayers, error: allPlayersError } = await db
      .from('game_players')
      .select('id, technologies')
      .eq('game_id', body.game_id)
    if (allPlayersError) return errorResponse('Database error', 500)

    const whgPlayers = (allPlayers ?? []).filter((p: { technologies?: string[] }) =>
      (p.technologies ?? []).includes('Wormhole Generator')
    )
    if (whgPlayers.length > 0) {
      const { error: windowError } = await db
        .from('games')
        .update({
          pending_action_window: {
            type: 'status_phase_wormhole',
            eligible_player_ids: whgPlayers.map((p: { id: string }) => p.id),
            passed_player_ids: [],
            context: {},
          },
        })
        .eq('id', body.game_id)
      if (windowError) return errorResponse(`Update failed: ${windowError.message}`, 500)
    }

    const { error } = await db
      .from('games')
      .update({ phase: 'status', active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

    // Reset Sustain Damage for all units in the game
    const { error: unitsError } = await db
      .from('game_player_units')
      .update({ damaged: false })
      .eq('game_id', body.game_id)
    if (unitsError) return errorResponse(`Failed to reset damaged units: ${unitsError.message}`, 500)

  } else if (game.phase === 'status') {
    // Status phase: new round — refresh planets, reset passed, strategy cards
    const { error: planetsError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', body.game_id)
    if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

    // Load all players for tech effects
    const { data: allPlayers, error: allPlayersError } = await db
      .from('game_players')
      .select('id, technologies, action_card_count, command_tokens')
      .eq('game_id', body.game_id)
    if (allPlayersError) return errorResponse('Database error', 500)

    // Per-player tech updates: Neural Motivator (action cards) + Hyper Metabolism (command tokens)
    // Build playerUpdates array for token gains, then apply Executive Sanctions law cap
    const rawPlayerUpdates = (allPlayers ?? []).map((player: { id: string; technologies?: string[]; command_tokens?: { tactic_total: number; fleet: number; strategy: number } }) => {
      const hasHyperMetabolism = (player.technologies ?? []).includes('Hyper Metabolism')
      return { playerId: player.id, tokenGain: hasHyperMetabolism ? 3 : 2 }
    })
    const playerUpdates = await applyStatusPhaseLaws(db, body.game_id, rawPlayerUpdates)

    for (const player of (allPlayers ?? [])) {
      const hasNeuralMotivator = (player.technologies ?? []).includes('Neural Motivator')
      const cardGain = hasNeuralMotivator ? 2 : 1
      const { error: cardError } = await db
        .from('game_players')
        .update({ action_card_count: (player.action_card_count ?? 0) + cardGain })
        .eq('id', player.id)
      if (cardError) return errorResponse(`Failed to update action cards: ${cardError.message}`, 500)

      const update = playerUpdates.find((u: { playerId: string; tokenGain: number }) => u.playerId === player.id)
      const tokenGain = update?.tokenGain ?? 2
      const tokens = player.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
      const { error: tokenError } = await db
        .from('game_players')
        .update({ command_tokens: { ...tokens, strategy: (tokens.strategy ?? 0) + tokenGain } })
        .eq('id', player.id)
      if (tokenError) return errorResponse(`Failed to update command tokens: ${tokenError.message}`, 500)
    }

    // Check for Bioplasmosis
    const bioPlayers = (allPlayers ?? []).filter((p: { technologies?: string[] }) =>
      (p.technologies ?? []).includes('Bioplasmosis')
    )
    if (bioPlayers.length > 0) {
      const { error: windowError } = await db
        .from('games')
        .update({
          pending_action_window: {
            type: 'after_status_phase',
            eligible_player_ids: bioPlayers.map((p: { id: string }) => p.id),
            passed_player_ids: [],
            context: { effect: 'redistribute_infantry' },
          },
        })
        .eq('id', body.game_id)
      if (windowError) return errorResponse(`Update failed: ${windowError.message}`, 500)
    }

    // Clear exhausted technologies
    const { error: exhaustedError } = await db
      .from('game_players')
      .update({ exhausted_technologies: [] })
      .eq('game_id', body.game_id)
    if (exhaustedError) return errorResponse(`Failed to clear exhausted technologies: ${exhaustedError.message}`, 500)

    const { error: resetError } = await db
      .from('game_players')
      .update({ passed: false, strategy_card: null, strategy_card_2: null })
      .eq('game_id', body.game_id)
    if (resetError) return errorResponse(`Failed to reset players: ${resetError.message}`, 500)


    // Ready legendary cards at the start of the new round
    const { error: legendaryError } = await db
      .from('game_player_legendary_cards')
      .update({ status: 'readied' })
      .eq('game_id', body.game_id)
    if (legendaryError) return errorResponse(`Failed to ready legendary cards: ${legendaryError.message}`, 500)

    // Reset movement blockers and no-move flags at the start of each new round
    if (!game.agenda_unlocked) {
      const { error: blockedError } = await db
        .from('games')
        .update({ movement_blocked_systems: [] })
        .eq('id', body.game_id)
      if (blockedError) return errorResponse(`Failed to reset movement blocks: ${blockedError.message}`, 500)

      const { error: noMoveError } = await db
        .from('game_player_units')
        .update({ no_move_this_round: false })
        .eq('game_id', body.game_id)
      if (noMoveError) return errorResponse(`Failed to reset no-move flags: ${noMoveError.message}`, 500)
    }

    const nextPhase = game.agenda_unlocked ? 'agenda' : 'strategy'
    const roundUpdate = game.agenda_unlocked ? game.round : game.round + 1

    // Reset vote_prevented when transitioning into agenda phase
    if (game.agenda_unlocked) {
      const { error: votePreventedError } = await db
        .from('game_players')
        .update({ vote_prevented: false })
        .eq('game_id', body.game_id)
      if (votePreventedError) return errorResponse(`Failed to reset vote_prevented: ${votePreventedError.message}`, 500)
    }


    const { error } = await db
      .from('games')
      .update({ phase: nextPhase, round: roundUpdate, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
  }

  const phaseAfter = game.phase === 'strategy' ? 'action'
    : game.phase === 'action' ? 'status'
    : game.agenda_unlocked ? 'agenda' : 'strategy'
  const roundAfter = game.phase === 'status' && !game.agenda_unlocked ? game.round + 1 : game.round
  await logEvent(db, {
    game_id: body.game_id,
    player_id: null,
    event_type: EVT_ADVANCE_PHASE,
    payload: { phase_before: game.phase, phase_after: phaseAfter, round: game.round },
    round: roundAfter,
    phase: phaseAfter,
  })
  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
