import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getNextPlayer } from '../_shared/player-order.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; choice?: unknown; vote_count?: unknown; abstain?: unknown }
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
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.agenda_vote_current_player_id) {
    return errorResponse('It is not your turn to vote', 403)
  }

  const abstain = body.abstain === true
  const voteCount = abstain ? 0 : (typeof body.vote_count === 'number' ? body.vote_count : 0)
  const choice = abstain ? null : (typeof body.choice === 'string' ? body.choice : null)

  if (!abstain && voteCount > 0) {
    const { data: planets } = await db
      .from('game_player_planets')
      .select('exhausted, influence')
      .eq('game_id', body.game_id)
      .eq('player_id', callerPlayer.id)
    const availableInfluence = (planets ?? [])
      .filter((p: { exhausted: boolean; influence: number }) => !p.exhausted)
      .reduce((sum: number, p: { influence: number }) => sum + (p.influence ?? 0), 0)
    if (voteCount > availableInfluence) {
      return errorResponse(`Vote count ${voteCount} exceeds available influence ${availableInfluence}`, 400)
    }
  }

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

  const { error: updateError } = await db
    .from('games')
    .update({ agenda_vote_current_player_id: nextVoterId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to advance voter: ${updateError.message}`, 500)

  return okResponse({ voted: true, all_voted: allVoted })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
