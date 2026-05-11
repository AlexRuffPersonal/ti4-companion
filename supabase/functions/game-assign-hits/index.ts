import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { checkAndEliminate } from '../_shared/eliminationHandler.ts'
import { logEvent, EVT_ASSIGN_HITS } from '../_shared/gameEvents.ts'

type Casualty = { unit_type: string; player_unit_id: string; action: 'destroy' | 'sustain' }
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; damaged: boolean; system_key: string }
type UnitDef = { name: string; sustain_damage: boolean }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; casualties?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!Array.isArray(body.casualties)) return errorResponse("'casualties' must be an array")

  const casualties = body.casualties as Casualty[]

  const { data: player } = await db
    .from('game_players').select('id')
    .eq('game_id', body.game_id).eq('user_id', userId).maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats').select('*')
    .eq('id', body.combat_id).eq('game_id', body.game_id).maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  const assignPhases = ['defender_assign', 'attacker_assign']
  if (!assignPhases.includes(combat.phase)) return errorResponse('Combat is not in an assign phase', 409)

  // Determine who is assigning hits and how many hits to assign
  const isDefenderAssign = combat.phase === 'defender_assign'
  const assigneeId = isDefenderAssign ? combat.defender_player_id : combat.attacker_player_id
  const hitsToAssign = isDefenderAssign ? combat.attacker_hits : combat.defender_hits

  if (player.id !== assigneeId) return errorResponse('Not your turn to assign hits', 409)
  if (casualties.length !== hitsToAssign) {
    return errorResponse(`Must assign exactly ${hitsToAssign} hits`, 409)
  }

  // Fetch assignee units with sustain info
  const { data: assigneeUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, damaged, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', assigneeId)
    .is('on_planet', null)

  const unitMap = new Map((assigneeUnits ?? []).map((u: UnitRow) => [u.id, u]))

  const unitTypes = [...new Set(casualties.map((c) => c.unit_type))]
  const { data: unitDefs } = await db
    .from('units').select('name, sustain_damage')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])
  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))

  // Validate casualties
  for (const c of casualties) {
    if (c.action === 'sustain') {
      const def = defMap.get(c.unit_type)
      if (!def?.sustain_damage) return errorResponse(`Cannot sustain ${c.unit_type}: no Sustain Damage ability`, 409)
      const unit = unitMap.get(c.player_unit_id)
      if (unit?.damaged) return errorResponse(`Cannot sustain ${c.unit_type}: unit is already damaged`, 409)
    }
  }

  // Apply casualties
  const destroyCounts = new Map<string, number>()
  for (const c of casualties) {
    if (c.action === 'destroy') {
      destroyCounts.set(c.player_unit_id, (destroyCounts.get(c.player_unit_id) ?? 0) + 1)
    }
    if (c.action === 'sustain') {
      await db.from('game_player_units').update({ damaged: true }).eq('id', c.player_unit_id)
    }
  }

  for (const [unitId, removeCount] of destroyCounts.entries()) {
    const unit = unitMap.get(unitId)
    if (!unit) continue
    const newCount = unit.count - removeCount
    if (newCount <= 0) {
      await db.from('game_player_units').delete().eq('id', unitId)
    } else {
      await db.from('game_player_units').update({ count: newCount }).eq('id', unitId)
    }
  }

  // If this was defender_assign, advance to defender_roll
  if (isDefenderAssign) {
    await db.from('game_combats').update({ phase: 'defender_roll' }).eq('id', body.combat_id)
    const eliminatedPlayerIds = await checkAndEliminate(db, body.game_id as string)
    await logEvent(db, {
      game_id: body.game_id,
      player_id: player.id,
      event_type: EVT_ASSIGN_HITS,
      payload: { player_id: player.id, combat_id: body.combat_id, casualties: body.casualties },
      round: 0,
      phase: 'action',
    })
    return okResponse({ phase: 'defender_roll', eliminatedPlayerIds })
  }

  // attacker_assign — check end-of-round conditions

  // Check for retreat
  if (combat.retreat_declared_by) {
    // Move retreating player's ships to retreat_destination
    const retreaterId = combat.retreat_declared_by
    await db
      .from('game_player_units')
      .update({ system_key: combat.retreat_destination })
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', retreaterId)
      .is('on_planet', null)

    // Insert retreat CC token
    await db.from('game_system_tokens').insert({
      game_id: body.game_id,
      system_key: combat.retreat_destination,
      player_id: retreaterId,
      token_type: 'retreat_cc',
    })

    const winnerId = retreaterId === combat.attacker_player_id
      ? combat.defender_player_id
      : combat.attacker_player_id

    await db.from('game_combats').update({
      status: 'complete',
      winner_player_id: winnerId,
    }).eq('id', body.combat_id)

    const eliminatedPlayerIds = await checkAndEliminate(db, body.game_id as string)
    await logEvent(db, {
      game_id: body.game_id,
      player_id: player.id,
      event_type: EVT_ASSIGN_HITS,
      payload: { player_id: player.id, combat_id: body.combat_id, casualties: body.casualties },
      round: 0,
      phase: 'action',
    })
    return okResponse({ status: 'complete', winner_player_id: winnerId, eliminatedPlayerIds })
  }

  // Check for 0 ships on either side
  const { data: atkUnitsLeft } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.attacker_player_id)
    .is('on_planet', null)

  const { data: defUnitsLeft } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.defender_player_id)
    .is('on_planet', null)

  const atkAlive = (atkUnitsLeft ?? []).length
  const defAlive = (defUnitsLeft ?? []).length

  if (atkAlive === 0 || defAlive === 0) {
    const winnerId = atkAlive > 0 ? combat.attacker_player_id : combat.defender_player_id
    await db.from('game_combats').update({
      status: 'complete',
      winner_player_id: winnerId,
    }).eq('id', body.combat_id)
    const eliminatedPlayerIds = await checkAndEliminate(db, body.game_id as string)
    await logEvent(db, {
      game_id: body.game_id,
      player_id: player.id,
      event_type: EVT_ASSIGN_HITS,
      payload: { player_id: player.id, combat_id: body.combat_id, casualties: body.casualties },
      round: 0,
      phase: 'action',
    })
    return okResponse({ status: 'complete', winner_player_id: winnerId, eliminatedPlayerIds })
  }

  // Continue to next round
  const nextRound = combat.round + 1
  await db.from('game_combats').update({
    phase: 'attacker_roll',
    round: nextRound,
    attacker_dice: null,
    defender_dice: null,
    attacker_hits: 0,
    defender_hits: 0,
  }).eq('id', body.combat_id)

  const eliminatedPlayerIds = await checkAndEliminate(db, body.game_id as string)
  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_ASSIGN_HITS,
    payload: { player_id: player.id, combat_id: body.combat_id, casualties: body.casualties },
    round: 0,
    phase: 'action',
  })
  return okResponse({ phase: 'attacker_roll', round: nextRound, eliminatedPlayerIds })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
