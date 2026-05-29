import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXHAUSTABLE_TECHS } from '../_shared/techEffects.ts'
import { logEvent, EVT_END_TURN } from '../_shared/gameEvents.ts'
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'

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
    .select('id, phase, active_player_id, map_tiles')
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

  // ── Phase 39b: Promissory note effects at the start of the next player's turn ──
  if (nextPlayerId) {
    // Cybernetic Enhancements (held): if the player about to act = ownerPlayerId → strategy token transfer
    const cyberneticNotes = await getHeldNotes(body.game_id, 'Cybernetic Enhancements', db)
    for (const note of cyberneticNotes) {
      if (note.ownerPlayerId !== nextPlayerId) continue
      // Load owner's current tokens
      const { data: ownerPlayer } = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', note.ownerPlayerId)
        .maybeSingle()
      const ownerTokens = (ownerPlayer as { command_tokens?: Record<string, number> } | null)?.command_tokens ?? {}
      const { data: holderPlayer } = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', note.holderPlayerId)
        .maybeSingle()
      const holderTokens = (holderPlayer as { command_tokens?: Record<string, number> } | null)?.command_tokens ?? {}
      // Origin (owner) −1 strategy token
      await db.from('game_players')
        .update({ command_tokens: { ...ownerTokens, strategy: Math.max(0, (ownerTokens.strategy ?? 0) - 1) } })
        .eq('id', note.ownerPlayerId)
      // Holder +1 strategy token
      await db.from('game_players')
        .update({ command_tokens: { ...holderTokens, strategy: (holderTokens.strategy ?? 0) + 1 } })
        .eq('id', note.holderPlayerId)
      try {
        await returnNote(note.instanceId, note.ownerPlayerId, db)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return errorResponse('Failed to return note: ' + message, 500)
      }
    }

    // Military Support (held): if the player about to act = ownerPlayerId → token transfer + 2 infantry
    const militaryNotes = await getHeldNotes(body.game_id, 'Military Support', db)
    for (const note of militaryNotes) {
      if (note.ownerPlayerId !== nextPlayerId) continue
      const infantryPlanet = typeof selections.infantry_planet === 'string' ? selections.infantry_planet : null
      // Load owner's current tokens
      const { data: ownerPlayer } = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', note.ownerPlayerId)
        .maybeSingle()
      const ownerTokens = (ownerPlayer as { command_tokens?: Record<string, number> } | null)?.command_tokens ?? {}
      // Origin (owner) −1 strategy token
      await db.from('game_players')
        .update({ command_tokens: { ...ownerTokens, strategy: Math.max(0, (ownerTokens.strategy ?? 0) - 1) } })
        .eq('id', note.ownerPlayerId)
      // Holder places 2 infantry on chosen planet
      if (infantryPlanet) {
        // Find system_key for the planet via holder's game_player_planets
        const { data: planetRow } = await db
          .from('game_player_planets')
          .select('tile_id')
          .eq('game_id', body.game_id)
          .eq('player_id', note.holderPlayerId)
          .eq('planet_name', infantryPlanet)
          .maybeSingle()
        const tileId = (planetRow as { tile_id?: string } | null)?.tile_id ?? null
        const mapTiles = (game.map_tiles ?? {}) as Record<string, { tile_id: string }>
        const systemKey = tileId
          ? (Object.entries(mapTiles).find(([, v]) => v.tile_id === tileId)?.[0] ?? null)
          : null
        if (systemKey) {
          const { data: existingInfantry } = await db
            .from('game_player_units')
            .select('id, count')
            .eq('game_id', body.game_id)
            .eq('system_key', systemKey)
            .eq('player_id', note.holderPlayerId)
            .eq('unit_type', 'infantry')
            .eq('on_planet', infantryPlanet)
            .maybeSingle()
          if (existingInfantry) {
            await db.from('game_player_units')
              .update({ count: (existingInfantry as { id: string; count: number }).count + 2 })
              .eq('id', (existingInfantry as { id: string; count: number }).id)
          } else {
            await db.from('game_player_units').insert({
              game_id: body.game_id,
              system_key: systemKey,
              player_id: note.holderPlayerId,
              unit_type: 'infantry',
              on_planet: infantryPlanet,
              count: 2,
            })
          }
        }
      }
      try {
        await returnNote(note.instanceId, note.ownerPlayerId, db)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return errorResponse('Failed to return note: ' + message, 500)
      }
    }

    // Spy Net (held): if the player about to act = holderPlayerId → steal 1 action card from owner (Yssaril)
    const spyNetNotes = await getHeldNotes(body.game_id, 'Spy Net', db)
    for (const note of spyNetNotes) {
      if (note.holderPlayerId !== nextPlayerId) continue
      // Owner (Yssaril) loses 1 action card; holder gains 1
      const { data: yssarilPlayer } = await db
        .from('game_players')
        .select('action_card_count')
        .eq('id', note.ownerPlayerId)
        .maybeSingle()
      const yssarilCards = (yssarilPlayer as { action_card_count?: number } | null)?.action_card_count ?? 0
      await db.from('game_players')
        .update({ action_card_count: Math.max(0, yssarilCards - 1) })
        .eq('id', note.ownerPlayerId)
      const { data: holderPlayer } = await db
        .from('game_players')
        .select('action_card_count')
        .eq('id', note.holderPlayerId)
        .maybeSingle()
      const holderCards = (holderPlayer as { action_card_count?: number } | null)?.action_card_count ?? 0
      await db.from('game_players')
        .update({ action_card_count: holderCards + 1 })
        .eq('id', note.holderPlayerId)
      try {
        await returnNote(note.instanceId, note.ownerPlayerId, db)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return errorResponse('Failed to return note: ' + message, 500)
      }
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: callerPlayer.id,
    event_type: EVT_END_TURN,
    payload: { player_id: callerPlayer.id, next_player_id: nextPlayerId },
    round: 0,
    phase: game.phase,
  })
  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
