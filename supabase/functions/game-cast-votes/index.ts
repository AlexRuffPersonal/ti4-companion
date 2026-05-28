import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getNextPlayer } from '../_shared/player-order.ts'
import { logEvent, EVT_CAST_VOTES } from '../_shared/gameEvents.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; choice?: unknown; vote_count?: unknown; abstain?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, speaker_player_id, agenda_current_card_id, agenda_vote_current_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (!game.agenda_current_card_id) return errorResponse('No agenda card in play', 409)

  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, trade_goods, vote_prevented, faction, leaders')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer) {
    return errorResponse('It is not your turn to vote', 403)
  }
  // Phase 43c: Xxcha commander grants immunity to vote prevention
  const callerLeaders = (callerPlayer as Record<string, unknown>).leaders as Record<string, string> | null
  const xxchaCommanderUnlocked = (callerPlayer as Record<string, unknown>).faction === 'The Xxcha Kingdom' && callerLeaders?.commander === 'unlocked'
  if ((callerPlayer as { vote_prevented?: boolean }).vote_prevented && !xxchaCommanderUnlocked) {
    return errorResponse('Your vote has been prevented', 409)
  }
  if (callerPlayer.id !== game.agenda_vote_current_player_id) {
    return errorResponse('It is not your turn to vote', 403)
  }

  // Genetic Recombination: open action window before current player votes if an opponent
  // has the unexhausted technology
  const { data: allOtherPlayers } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies')
    .eq('game_id', body.game_id)
  const opponents = (allOtherPlayers ?? []).filter(
    (p: { id: string; technologies: string[] | null; exhausted_technologies: string[] | null }) =>
      p.id !== callerPlayer.id,
  )
  const geneticRecombinationHolder = opponents.find(
    (p: { technologies: string[] | null; exhausted_technologies: string[] | null }) => {
      const techs = p.technologies ?? []
      const exhausted = p.exhausted_technologies ?? []
      return techs.includes('Genetic Recombination') && !exhausted.includes('Genetic Recombination')
    },
  )
  if (geneticRecombinationHolder) {
    const { error: windowError } = await db
      .from('games')
      .update({
        pending_action_window: {
          type: 'before_player_votes',
          eligible_player_ids: [geneticRecombinationHolder.id],
          passed_player_ids: [],
          context: { voting_player_id: callerPlayer.id },
        },
      })
      .eq('id', body.game_id)
    if (windowError) return errorResponse(`Failed to open action window: ${windowError.message}`, 500)
    return okResponse({ window_opened: true })
  }

  const abstain = body.abstain === true
  let voteCount = abstain ? 0 : (typeof body.vote_count === 'number' ? body.vote_count : 0)
  const choice = abstain ? null : (typeof body.choice === 'string' ? body.choice : null)

  // Predictive Intelligence: add 3 bonus votes when player uses the ability
  const callerTechs: string[] = callerPlayer.technologies ?? []
  const selections = (typeof body.selections === 'object' && body.selections !== null) ? body.selections as Record<string, unknown> : {}
  if (!abstain && callerTechs.includes('Predictive Intelligence') && selections.use_predictive === true) {
    voteCount += 3
  }

  // Phase 43c: apply CAST_VOTES commander passives (Xxcha extra vote per planet, Hacan TG votes)
  const castContext: Record<string, unknown> = {
    gameId: body.game_id,
    activatingPlayerId: callerPlayer.id,
    faction: (callerPlayer as Record<string, unknown>).faction ?? '',
    selections,
    extraVotes: 0,
  }
  if (!abstain) {
    const { inlineEffects } = await applyCommanderPassives('CAST_VOTES', castContext as never, db)
    for (const effect of inlineEffects) {
      const effectKey = (effect as Record<string, unknown>).effect
      if (typeof effectKey === 'string') {
        try { await getHandler(effectKey)(castContext as never, db) } catch { /* non-fatal */ }
      }
    }
  }

  if (!abstain && voteCount > 0) {
    const { data: planets } = await db
      .from('game_player_planets')
      .select('exhausted, influence')
      .eq('game_id', body.game_id)
      .eq('player_id', callerPlayer.id)

    // Mirror Computing: trade goods count as 2 influence each when voting
    const hasMirrorComputing = callerTechs.includes('Mirror Computing')
    const tgInfluence = (callerPlayer.trade_goods ?? 0) * (hasMirrorComputing ? 2 : 1)

    const availableInfluence =
      (planets ?? [])
        .filter((p: { exhausted: boolean; influence: number }) => !p.exhausted)
        .reduce((sum: number, p: { influence: number }) => sum + (p.influence ?? 0), 0) +
      tgInfluence

    // When Predictive Intelligence adds votes the check is against base vote_count (before +3),
    // because the +3 are granted on top of what influence allows.
    const baseVoteCount = abstain ? 0 : (typeof body.vote_count === 'number' ? body.vote_count : 0)
    if (baseVoteCount > availableInfluence) {
      return errorResponse(`Vote count ${baseVoteCount} exceeds available influence ${availableInfluence}`, 400)
    }
  }

  // Phase 29b Part A: When voting begins — open window on first vote for this agenda
  const { count: existingVoteCount } = await db
    .from('game_agenda_votes')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', body.game_id)
    .eq('agenda_id', game.agenda_current_card_id)

  if ((existingVoteCount ?? 0) === 0) {
    const { data: eligibleWhenVoting } = await db
      .from('game_action_card_deck')
      .select('held_by_player_id, action_cards!inner(timing, ability)')
      .eq('game_id', body.game_id)
      .eq('state', 'hand')
      .eq('action_cards.timing', 'When voting begins:')
      .not('action_cards.ability', 'is', null)

    const eligibleIds = (eligibleWhenVoting ?? []).map((r: { held_by_player_id: string }) => r.held_by_player_id)
    if (eligibleIds.length > 0) {
      await db.from('games').update({
        pending_action_window: {
          type: 'when_voting_begins',
          eligible_player_ids: eligibleIds,
          passed_player_ids: [],
          context: { agenda_id: game.agenda_current_card_id },
        },
      }).eq('id', game.id)
      return okResponse({ window_opened: 'when_voting_begins' })
      // vote not yet cast; caller re-submits after window resolves
    }
  }

  // Add commander passive extra votes to the final vote count
  voteCount += ((castContext.extraVotes as number) ?? 0)

  const { error: upsertError } = await db
    .from('game_agenda_votes')
    .upsert(
      {
        game_id: body.game_id,
        game_player_id: callerPlayer.id,
        agenda_id: game.agenda_current_card_id,
        choice,
        vote_count: voteCount,
        abstained: abstain,
      },
      { onConflict: 'game_id,game_player_id,agenda_id' },
    )
  if (upsertError) return errorResponse(`Failed to record vote: ${upsertError.message}`, 500)

  // Phase 29b Part B: After the speaker votes — open window for matching cards
  // game.speaker_player_id is a game_players.id (FK), so compare directly
  if (game.speaker_player_id === callerPlayer.id) {
    const { data: eligibleAfterSpeaker } = await db
      .from('game_action_card_deck')
      .select('held_by_player_id, action_cards!inner(timing, ability)')
      .eq('game_id', body.game_id)
      .eq('state', 'hand')
      .eq('action_cards.timing', 'After the speaker votes on an agenda:')
      .not('action_cards.ability', 'is', null)

    const eligibleIds = (eligibleAfterSpeaker ?? []).map((r: { held_by_player_id: string }) => r.held_by_player_id)
    if (eligibleIds.length > 0) {
      await db.from('games').update({
        pending_action_window: {
          type: 'after_speaker_votes',
          eligible_player_ids: eligibleIds,
          passed_player_ids: [],
          context: { agenda_id: game.agenda_current_card_id },
        },
      }).eq('id', game.id)
    }
  }

  // Check if all players have now voted
  const { data: allPlayers } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
  const { data: votes } = await db
    .from('game_agenda_votes')
    .select('game_player_id')
    .eq('game_id', body.game_id)
    .eq('agenda_id', game.agenda_current_card_id)

  const allVoted = (allPlayers ?? []).length === (votes ?? []).length

  let nextVoterId: string | null = null
  if (!allVoted) {
    nextVoterId = await getNextPlayer(body.game_id, callerPlayer.id, 'reverse_speaker', game.speaker_player_id, db)
  }

  // Conditional update: only advance if this player is still the current voter.
  // This prevents a race where two simultaneous last-voters both see allVoted=false
  // and each advance the pointer independently.
  const { error: updateError } = await db
    .from('games')
    .update({ agenda_vote_current_player_id: nextVoterId })
    .eq('id', body.game_id)
    .eq('agenda_vote_current_player_id', callerPlayer.id)
  if (updateError) return errorResponse(`Failed to advance voter: ${updateError.message}`, 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: callerPlayer.id,
    event_type: EVT_CAST_VOTES,
    payload: { player_id: callerPlayer.id, agenda_id: game.agenda_current_card_id, votes: voteCount, outcome: choice },
    round: 0,
    phase: 'agenda',
  })
  return okResponse({ voted: true, all_voted: allVoted })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
