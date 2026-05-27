import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_RESOLVE_AGENDA } from '../_shared/gameEvents.ts'

const STEP_AFTER: Record<string, string> = {
  'agenda_1_voting': 'agenda_1_resolved',
  'agenda_2_voting': 'done',
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; agenda_id?: unknown; elected_target?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.agenda_id || typeof body.agenda_id !== 'string') return errorResponse("'agenda_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, speaker_player_id, agenda_current_card_id, agenda_phase_step, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.speaker_player_id) {
    return errorResponse('Only the speaker can resolve the agenda', 403)
  }

  if (game.agenda_current_card_id !== body.agenda_id) {
    return errorResponse('agenda_id does not match current card', 409)
  }

  const { data: agenda } = await db
    .from('agendas')
    .select('id, type, elect_type, tractable, effect_json')
    .eq('id', body.agenda_id)
    .maybeSingle()
  if (!agenda) return errorResponse('Agenda not found', 404)

  const { data: deckRow } = await db
    .from('game_agenda_deck')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('agenda_id', body.agenda_id)
    .eq('state', 'voting')
    .maybeSingle()
  if (!deckRow) return errorResponse('Deck row not found', 404)

  const electedTarget = typeof body.elected_target === 'string' ? body.elected_target : null
  const isLaw = agenda.type === 'law'
  const terminalDeckState = isLaw ? 'enacted' : 'discarded'

  // For player-elect agendas, validate that electedTarget belongs to this game
  if (agenda.elect_type === 'player' && electedTarget) {
    const { data: targetPlayer } = await db
      .from('game_players')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('id', electedTarget)
      .maybeSingle()
    if (!targetPlayer) return errorResponse('elected_target is not a player in this game', 400)
  }

  // Apply tractable effect
  if (isLaw && agenda.tractable && agenda.effect_json?.op) {
    const effect = agenda.effect_json as { op: string; amount?: number; tech?: string }

    if (effect.op === 'award_vp' && electedTarget) {
      let targetPlayerId = electedTarget
      // For planet-elect laws, look up the player who controls the planet
      if (agenda.elect_type === 'planet') {
        const { data: planetControl } = await db
          .from('game_player_planets')
          .select('player_id')
          .eq('game_id', body.game_id)
          .eq('planet_name', electedTarget)
          .maybeSingle()
        if (planetControl) {
          targetPlayerId = planetControl.player_id
        } else {
          // Planet not controlled by anyone, skip VP award
          targetPlayerId = null
        }
      }

      if (targetPlayerId) {
        const { data: target } = await db.from('game_players').select('vp').eq('id', targetPlayerId).maybeSingle()
        if (target) {
          await db.from('game_players').update({ vp: target.vp + (effect.amount ?? 1) }).eq('id', targetPlayerId)
        }
      }
    }

    if (effect.op === 'remove_vp' && electedTarget) {
      const { data: target } = await db.from('game_players').select('vp').eq('id', electedTarget).maybeSingle()
      if (target) {
        await db.from('game_players').update({ vp: Math.max(0, target.vp - (effect.amount ?? 1)) }).eq('id', electedTarget)
      }
    }

    if (effect.op === 'exhaust_planet' && electedTarget) {
      await db.from('game_player_planets').update({ exhausted: true }).eq('game_id', body.game_id).eq('planet_name', electedTarget)
    }

    if (effect.op === 'grant_tech' && electedTarget && effect.tech) {
      const { data: target } = await db.from('game_players').select('technologies').eq('id', electedTarget).maybeSingle()
      if (target) {
        const techs: string[] = target.technologies ?? []
        if (!techs.includes(effect.tech)) {
          await db.from('game_players').update({ technologies: [...techs, effect.tech] }).eq('id', electedTarget)
        }
      }
    }
  }

  // Update deck state
  await db.from('game_agenda_deck').update({ state: terminalDeckState }).eq('id', deckRow.id)

  // Insert law record if applicable
  if (isLaw) {
    const electedPlanetName = agenda.elect_type === 'planet' ? electedTarget : null
    await db.from('game_laws').insert({
      game_id: body.game_id,
      agenda_id: body.agenda_id,
      round_enacted: game.round,
      elected_target: electedTarget,
      elected_planet_name: electedPlanetName,
      is_repealed: false,
      host_applies_manually: !agenda.tractable,
    })
  }

  // Advance game step
  const nextStep = STEP_AFTER[game.agenda_phase_step] ?? 'done'
  await db.from('games').update({
    agenda_phase_step: nextStep,
    agenda_current_card_id: null,
    agenda_vote_current_player_id: null,
  }).eq('id', body.game_id)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: null,
    event_type: EVT_RESOLVE_AGENDA,
    payload: { agenda_id: body.agenda_id, outcome: electedTarget },
    round: game.round,
    phase: 'agenda',
  })
  return okResponse({ resolved: true, next_step: nextStep })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
