import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

// ---------------------------------------------------------------------------
// Card-to-phase validity map
// ---------------------------------------------------------------------------
const CARD_VALID_PHASES: Record<string, string[]> = {
  'Morale Boost':               ['window_start_round'],
  'Fighter Prototype':          ['window_start_round'],
  'Shields Holding':            ['window_pre_assign_defender', 'window_pre_assign_attacker'],
  'Waylay':                     ['window_pre_barrage'],
  'Maneuvering Jets':           ['window_space_cannon_assign'],
  'Emergency Repairs':          ['window_start_round'],
  'Direct Hit':                 ['window_post_sustain'],
  'Skilled Retreat':            ['window_start_round', 'window_announce_retreat'],
  'Rout':                       ['window_announce_retreat'],
  'Intercept':                  ['window_announce_retreat'],
  'Courageous To The End':      ['window_post_destroy'],
  'Experimental Battlestation': ['window_pre_space_cannon'],
  'In The Silence Of Space':    ['window_pre_space_cannon'],
  'Salvage':                    ['window_post_combat'],
}

function isCardValidForPhase(cardName: string, phase: string): boolean {
  const allowed = CARD_VALID_PHASES[cardName]
  if (allowed) return allowed.includes(phase)
  // Unknown cards: allow if phase is a window phase
  return phase.startsWith('window_')
}

// ---------------------------------------------------------------------------
// Axial distance helpers
// ---------------------------------------------------------------------------
function axialDistance(a: string, b: string): number {
  const [aq, ar] = a.split(',').map(Number)
  const [bq, br] = b.split(',').map(Number)
  const as_ = -aq - ar
  const bs_ = -bq - br
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as_ - bs_)) / 2
}

// ---------------------------------------------------------------------------
// Re-evaluate win condition: if opponent has 0 ships, mark combat complete
// ---------------------------------------------------------------------------
async function checkWinCondition(
  gameId: string,
  combatId: string,
  systemKey: string,
  winnerId: string,
  opponentId: string,
): Promise<void> {
  const { data: opponentShips } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', opponentId)
    .is('on_planet', null)
    .limit(1)
  if ((opponentShips ?? []).length === 0) {
    await db
      .from('game_combats')
      .update({ status: 'complete', winner_player_id: winnerId })
      .eq('id', combatId)
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_code?: unknown
    combat_id?: unknown
    card_id?: unknown
    targets?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_code || typeof body.game_code !== 'string') return errorResponse("'game_code' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!body.card_id   || typeof body.card_id   !== 'string') return errorResponse("'card_id' is required")

  const targets = (body.targets ?? {}) as Record<string, unknown>

  // Resolve game by code
  const { data: game } = await db
    .from('games')
    .select('id, phase, round')
    .eq('code', body.game_code)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const gameId: string = (game as Record<string, string>).id

  // Fetch player
  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  // Fetch combat
  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  const side: 'attacker' | 'defender' =
    player.id === combat.attacker_player_id ? 'attacker' : 'defender'
  const opponentSide: 'attacker' | 'defender' = side === 'attacker' ? 'defender' : 'attacker'
  const opponentId: string =
    side === 'attacker' ? combat.defender_player_id : combat.attacker_player_id

  // Check window-pass status
  const windowPasses = (combat.window_passes ?? {}) as Record<string, boolean>
  if (windowPasses[side] === true) {
    return errorResponse('Already passed this window', 409)
  }

  // Verify player holds the card
  const { data: handCard } = await db
    .from('game_player_action_cards')
    .select('id, action_card_id')
    .eq('id', body.card_id)
    .eq('player_id', player.id)
    .maybeSingle()
  if (!handCard) return errorResponse('Card not found in hand', 404)

  // Fetch card definition
  const { data: cardDef } = await db
    .from('action_cards')
    .select('id, name')
    .eq('id', handCard.action_card_id)
    .maybeSingle()
  if (!cardDef) return errorResponse('Card definition not found', 404)

  const cardName: string = cardDef.name as string

  // Phase timing check
  if (!isCardValidForPhase(cardName, combat.phase as string)) {
    return errorResponse('Card not valid in this timing window', 409)
  }

  // Same-name rule: same card name + same target entity → reject
  const targetEntityId =
    typeof targets.unit_id === 'string' ? targets.unit_id :
    typeof targets.destination_system_key === 'string' ? targets.destination_system_key :
    typeof targets.system_key === 'string' ? targets.system_key :
    typeof targets.space_dock_unit_id === 'string' ? targets.space_dock_unit_id :
    null

  const { data: alreadyPlayed } = await db
    .from('game_player_action_cards_played')
    .select('id, target_entity_id')
    .eq('combat_id', body.combat_id)
    .eq('window_phase', combat.phase)
    .eq('card_name', cardName)

  if ((alreadyPlayed ?? []).some(
    (p: Record<string, unknown>) => p.target_entity_id === targetEntityId,
  )) {
    return errorResponse('Same card already played against this target', 409)
  }

  // Mutable pending effects
  const pendingEffects: Record<string, unknown> = { ...(combat.pending_effects ?? {}) }

  // ---------------------------------------------------------------------------
  // Per-card effects
  // ---------------------------------------------------------------------------

  if (cardName === 'Morale Boost') {
    const key = `morale_boost_${side}` as string
    pendingEffects[key] = ((pendingEffects[key] as number | undefined) ?? 0) + 1

  } else if (cardName === 'Fighter Prototype') {
    if (combat.round !== 1) return errorResponse('Fighter Prototype only valid in round 1', 409)
    pendingEffects[`fighter_prototype_${side}`] = true

  } else if (cardName === 'Shields Holding') {
    // Must be the defending player for this assign window
    const receivingWindow =
      combat.phase === 'window_pre_assign_defender' ? 'defender' : 'attacker'
    if (side !== receivingWindow) return errorResponse('Not valid for this player', 409)
    const key = `shields_holding_${side}` as string
    pendingEffects[key] = ((pendingEffects[key] as number | undefined) ?? 0) + 2

  } else if (cardName === 'Waylay') {
    if (combat.phase !== 'window_pre_barrage') return errorResponse('Waylay only valid in window_pre_barrage', 409)
    pendingEffects[`waylay_${side}`] = true

  } else if (cardName === 'Maneuvering Jets') {
    if (combat.phase !== 'window_space_cannon_assign') {
      return errorResponse('Maneuvering Jets only valid in window_space_cannon_assign', 409)
    }
    const hitsKey = 'attacker_space_cannon_hits'
    const current = (pendingEffects[hitsKey] as number | undefined) ?? (combat.attacker_space_cannon_hits as number | undefined) ?? 0
    pendingEffects[hitsKey] = Math.max(0, current - 1)

  } else if (cardName === 'Emergency Repairs') {
    await db
      .from('game_player_units')
      .update({ damaged: false })
      .eq('game_id', gameId)
      .eq('system_key', combat.system_key)
      .eq('player_id', player.id)

  } else if (cardName === 'Direct Hit') {
    const targetUnitId = targets.unit_id
    if (typeof targetUnitId !== 'string') return errorResponse("'targets.unit_id' is required for Direct Hit", 400)

    // Verify unit appears in sustained_this_phase
    const sustainedList = (combat.sustained_this_phase ?? []) as Array<Record<string, unknown>>
    const sustainEntry = sustainedList.find(
      (e) => e.unit_id === targetUnitId,
    )
    if (!sustainEntry) return errorResponse('Target unit has not sustained damage this phase', 409)

    // Verify the card player is the one whose units produced the hit
    // (they must have a hit entry targeting this unit, i.e. they are the opponent of the unit's owner)
    // The unit belongs to the opponent; verify caller is opponent of the unit owner
    const { data: targetUnit } = await db
      .from('game_player_units')
      .select('id, count, player_id, unit_type')
      .eq('id', targetUnitId)
      .maybeSingle()
    if (!targetUnit) return errorResponse('Target unit not found', 404)
    if ((targetUnit as Record<string, unknown>).player_id === player.id) {
      return errorResponse('Cannot Direct Hit your own unit', 409)
    }

    // Destroy the unit (count-1 or delete)
    const unitCount = (targetUnit as Record<string, number>).count
    if (unitCount > 1) {
      await db
        .from('game_player_units')
        .update({ count: unitCount - 1 })
        .eq('id', targetUnitId)
    } else {
      await db
        .from('game_player_units')
        .delete()
        .eq('id', targetUnitId)
    }

    // Re-evaluate win condition
    await checkWinCondition(gameId, body.combat_id as string, combat.system_key as string, player.id, opponentId)

  } else if (cardName === 'Skilled Retreat') {
    const dest = targets.destination_system_key
    if (typeof dest !== 'string') return errorResponse("'targets.destination_system_key' is required for Skilled Retreat", 400)

    // Verify adjacency (axial distance = 1) or wormhole connection (simple axial check only)
    if (axialDistance(combat.system_key as string, dest) > 1) {
      return errorResponse('Destination is not adjacent to the combat system', 409)
    }

    // Verify destination has no enemy ships
    const { data: enemyShips } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', gameId)
      .eq('system_key', dest)
      .eq('player_id', opponentId)
      .is('on_planet', null)
      .limit(1)
    if ((enemyShips ?? []).length > 0) {
      return errorResponse('Destination contains enemy ships', 409)
    }

    // Move all player ships to destination
    await db
      .from('game_player_units')
      .update({ system_key: dest })
      .eq('game_id', gameId)
      .eq('player_id', player.id)
      .eq('system_key', combat.system_key)
      .is('on_planet', null)

    // Insert retreat CC token
    await db
      .from('game_system_tokens')
      .insert({
        game_id: gameId,
        system_key: dest,
        player_id: player.id,
        token_type: 'retreat_cc',
      })

    // End the combat
    await db
      .from('game_combats')
      .update({ status: 'complete' })
      .eq('id', body.combat_id)

    // Discard card and record play, then return early (combat over)
    await db.from('game_player_action_cards').delete().eq('id', body.card_id)
    await db.from('game_player_action_cards_played').insert({
      combat_id: body.combat_id,
      window_phase: combat.phase,
      card_name: cardName,
      player_id: player.id,
      target_entity_id: targetEntityId,
    })
    return okResponse({ phase: combat.phase })

  } else if (cardName === 'Rout') {
    if (side !== 'defender') return errorResponse('Only defender can play Rout', 409)
    pendingEffects['rout_active'] = true

  } else if (cardName === 'Intercept') {
    if (!combat.retreat_declared_by) return errorResponse('No retreat to intercept', 409)
    if (combat.retreat_declared_by === player.id) return errorResponse('Cannot intercept own retreat', 409)
    await db
      .from('game_combats')
      .update({ retreat_declared_by: null, retreat_destination: null })
      .eq('id', body.combat_id)

    // Discard and record, reset opponent pass, return early
    await db.from('game_player_action_cards').delete().eq('id', body.card_id)
    await db.from('game_player_action_cards_played').insert({
      combat_id: body.combat_id,
      window_phase: combat.phase,
      card_name: cardName,
      player_id: player.id,
      target_entity_id: targetEntityId,
    })
    const updatedPasses = { ...windowPasses, [opponentSide]: false }
    await db
      .from('game_combats')
      .update({ window_passes: updatedPasses })
      .eq('id', body.combat_id)
    return okResponse({ phase: combat.phase })

  } else if (cardName === 'Courageous To The End') {
    const destroyedList = (combat.destroyed_this_phase ?? []) as Array<Record<string, unknown>>
    const destroyedEntry = destroyedList.find(
      (e) => e.player_id === player.id,
    )
    if (!destroyedEntry) return errorResponse('No destroyed ship this phase', 409)

    const combatValue = (destroyedEntry.combat_value as number | undefined) ?? 6
    let hits = 0
    for (let i = 0; i < 2; i++) {
      const roll = Math.ceil(Math.random() * 10)
      if (roll >= combatValue) hits++
    }

    const hitsKey = `${opponentSide}_hits`
    const currentOpponentHits = (combat[hitsKey] as number | undefined) ?? 0
    const forcedHitsKey = `forced_hits_${opponentSide}`

    pendingEffects[forcedHitsKey] = hits

    await db
      .from('game_combats')
      .update({
        [hitsKey]: currentOpponentHits + hits,
        pending_effects: pendingEffects,
        window_passes: { ...windowPasses, [opponentSide]: false },
      })
      .eq('id', body.combat_id)

    await db.from('game_player_action_cards').delete().eq('id', body.card_id)
    await db.from('game_player_action_cards_played').insert({
      combat_id: body.combat_id,
      window_phase: combat.phase,
      card_name: cardName,
      player_id: player.id,
      target_entity_id: targetEntityId,
    })
    return okResponse({ phase: combat.phase })

  } else if (cardName === 'Experimental Battlestation') {
    if (!combat.ships_moved_in) return errorResponse('No ships moved into system', 409)

    const spaceDockId = targets.space_dock_unit_id
    if (typeof spaceDockId !== 'string') {
      return errorResponse("'targets.space_dock_unit_id' is required for Experimental Battlestation", 400)
    }

    const { data: dock } = await db
      .from('game_player_units')
      .select('id, system_key, unit_type, player_id')
      .eq('id', spaceDockId)
      .eq('unit_type', 'space_dock')
      .eq('player_id', player.id)
      .maybeSingle()
    if (!dock) return errorResponse('Space dock not found', 404)

    // Verify dock is adjacent to or in the combat system
    const dockSystemKey = (dock as Record<string, string>).system_key
    const isInSystem = dockSystemKey === combat.system_key
    const isAdjacent = axialDistance(dockSystemKey, combat.system_key as string) <= 1
    if (!isInSystem && !isAdjacent) {
      return errorResponse('Space dock is not adjacent to the combat system', 409)
    }

    // Get space cannon stat for space_dock
    const { data: unitDef } = await db
      .from('units')
      .select('space_cannon')
      .eq('name', 'space_dock')
      .maybeSingle()
    const scText = (unitDef?.space_cannon as string | null) ?? '5 (x3)'
    const scMatch = scText.match(/^(\d+)/)
    const diceMatch = scText.match(/\(x(\d+)\)/)
    const scValue = scMatch ? parseInt(scMatch[1]) : 5
    const diceCount = diceMatch ? parseInt(diceMatch[1]) : 3

    let hits = 0
    for (let i = 0; i < diceCount; i++) {
      if (Math.ceil(Math.random() * 10) >= scValue) hits++
    }

    const currentAtkHits = (combat.attacker_hits as number | undefined) ?? 0
    await db
      .from('game_combats')
      .update({
        attacker_hits: currentAtkHits + hits,
        pending_effects: { ...pendingEffects },
        window_passes: { ...windowPasses, [opponentSide]: false },
      })
      .eq('id', body.combat_id)

    await db.from('game_player_action_cards').delete().eq('id', body.card_id)
    await db.from('game_player_action_cards_played').insert({
      combat_id: body.combat_id,
      window_phase: combat.phase,
      card_name: cardName,
      player_id: player.id,
      target_entity_id: targetEntityId,
    })
    return okResponse({ phase: combat.phase })

  } else if (cardName === 'In The Silence Of Space') {
    if (combat.phase !== 'window_pre_space_cannon') {
      return errorResponse('In The Silence Of Space only valid in window_pre_space_cannon', 409)
    }
    const silentSystem = targets.system_key
    if (typeof silentSystem !== 'string') {
      return errorResponse("'targets.system_key' is required for In The Silence Of Space", 400)
    }

    // Verify the target system contains player's ships
    const { data: playerShips } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', gameId)
      .eq('system_key', silentSystem)
      .eq('player_id', player.id)
      .is('on_planet', null)
      .limit(1)
    if ((playerShips ?? []).length === 0) {
      return errorResponse('No ships in target system', 409)
    }

    pendingEffects['silent_space_system'] = silentSystem

    // Append new space cannon opportunity to space_cannon_pending
    const existingPending = (combat.space_cannon_pending ?? []) as Array<Record<string, unknown>>
    const updatedSpaceCannonPending = [
      ...existingPending,
      {
        player_id: player.id,
        system_key: silentSystem,
        resolved: false,
        source: 'in_the_silence_of_space',
      },
    ]

    await db
      .from('game_combats')
      .update({
        pending_effects: pendingEffects,
        space_cannon_pending: updatedSpaceCannonPending,
        window_passes: { ...windowPasses, [opponentSide]: false },
      })
      .eq('id', body.combat_id)

    await db.from('game_player_action_cards').delete().eq('id', body.card_id)
    await db.from('game_player_action_cards_played').insert({
      combat_id: body.combat_id,
      window_phase: combat.phase,
      card_name: cardName,
      player_id: player.id,
      target_entity_id: targetEntityId,
    })
    return okResponse({ phase: combat.phase })

  } else if (cardName === 'Salvage') {
    if (combat.winner_player_id !== player.id) {
      return errorResponse('Only winner can play Salvage', 409)
    }
    const loserId: string =
      side === 'attacker' ? combat.defender_player_id : combat.attacker_player_id

    const { data: loser } = await db
      .from('game_players')
      .select('id, commodities')
      .eq('id', loserId)
      .maybeSingle()
    if (!loser) return errorResponse('Loser player not found', 404)

    const loserCommodities = (loser as Record<string, number>).commodities ?? 0

    // Update winner commodities
    const { data: winner } = await db
      .from('game_players')
      .select('id, commodities')
      .eq('id', player.id)
      .maybeSingle()
    const winnerCommodities = (winner as Record<string, number> | null)?.commodities ?? 0

    await db
      .from('game_players')
      .update({ commodities: winnerCommodities + loserCommodities })
      .eq('id', player.id)
    await db
      .from('game_players')
      .update({ commodities: 0 })
      .eq('id', loserId)
  }

  // ---------------------------------------------------------------------------
  // Discard card and record play
  // ---------------------------------------------------------------------------
  await db.from('game_player_action_cards').delete().eq('id', body.card_id)
  await db.from('game_player_action_cards_played').insert({
    combat_id: body.combat_id,
    window_phase: combat.phase,
    card_name: cardName,
    player_id: player.id,
    target_entity_id: targetEntityId,
  })

  // Update pending_effects and reset opponent pass
  await db
    .from('game_combats')
    .update({
      pending_effects: pendingEffects,
      window_passes: { ...windowPasses, [opponentSide]: false },
    })
    .eq('id', body.combat_id)

  return okResponse({ phase: combat.phase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
