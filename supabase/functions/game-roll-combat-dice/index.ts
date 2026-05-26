import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { resolveUnitStats } from '../_shared/techEffects.ts'
import { logEvent, EVT_ROLL_COMBAT_DICE } from '../_shared/gameEvents.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; combat: string | null; afb: string | null; sustain_damage: boolean }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollDice(units: UnitRow[], defMap: Map<string, UnitDef>, technologies: string[] = []): { results: DieResult[]; hits: number } {
  const results: DieResult[] = []
  let hits = 0
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.combat) continue
    // Phase 30: resolve upgraded stats
    const resolvedStats = resolveUnitStats(unit.unit_type, { combat: parseStat(def.combat).value, dice: parseStat(def.combat).dice, move: 0, capacity: 0, production: 0, sustain: def.sustain_damage ?? false }, technologies)
    const value = resolvedStats.combat
    const diceCount = resolvedStats.dice * unit.count
    for (let i = 0; i < diceCount; i++) {
      const roll = Math.ceil(Math.random() * 10)
      const hit = roll >= value
      if (hit) hits++
      results.push({ unit_type: unit.unit_type, roll, hit_on: value, hit })
    }
  }
  return { results, hits }
}

async function applyAfbHits(gameId: string, systemKey: string, targetId: string, hits: number): Promise<void> {
  if (hits <= 0) return
  const { data: fighters } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', targetId)
    .eq('unit_type', 'fighter')
    .is('on_planet', null)
  for (const f of fighters ?? []) {
    const remove = Math.min(hits, f.count)
    if (f.count - remove === 0) {
      await db.from('game_player_units').delete().eq('id', f.id)
    } else {
      await db.from('game_player_units').update({ count: f.count - remove }).eq('id', f.id)
    }
    hits -= remove
    if (hits <= 0) break
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")

  const { data: player } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  const rollPhases = ['barrage', 'attacker_roll', 'defender_roll']
  if (!rollPhases.includes(combat.phase)) {
    return errorResponse('Combat is not a roll phase', 409)
  }

  if (combat.phase === 'attacker_roll' && player.id !== combat.attacker_player_id) {
    return errorResponse('Not your roll — attacker must roll', 409)
  }
  if (combat.phase === 'defender_roll' && player.id !== combat.defender_player_id) {
    return errorResponse('Not your roll — defender must roll', 409)
  }

  // Barrage phase: both players' destroyers fire AFB simultaneously
  if (combat.phase === 'barrage') {
    const { data: atkDestroyers } = await db
      .from('game_player_units')
      .select('id, player_id, unit_type, count, system_key')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', combat.attacker_player_id)
      .eq('unit_type', 'destroyer')
      .is('on_planet', null)

    const { data: defDestroyers } = await db
      .from('game_player_units')
      .select('id, player_id, unit_type, count, system_key')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', combat.defender_player_id)
      .eq('unit_type', 'destroyer')
      .is('on_planet', null)

    const { data: defDef } = await db
      .from('units')
      .select('name, afb')
      .eq('name', 'destroyer')
      .maybeSingle()

    if (defDef?.afb) {
      const { value, dice } = parseStat(defDef.afb)

      let atkAfbHits = 0
      for (const d of atkDestroyers ?? []) {
        for (let i = 0; i < dice * d.count; i++) {
          if (Math.ceil(Math.random() * 10) >= value) atkAfbHits++
        }
      }
      let defAfbHits = 0
      for (const d of defDestroyers ?? []) {
        for (let i = 0; i < dice * d.count; i++) {
          if (Math.ceil(Math.random() * 10) >= value) defAfbHits++
        }
      }

      await applyAfbHits(body.game_id, combat.system_key, combat.defender_player_id, atkAfbHits)
      await applyAfbHits(body.game_id, combat.system_key, combat.attacker_player_id, defAfbHits)
    }

    await db.from('game_combats').update({ phase: 'attacker_roll' }).eq('id', body.combat_id)
    return okResponse({ phase: 'attacker_roll' })
  }

  // Main combat roll (attacker_roll or defender_roll)
  const rollingPlayerId = combat.phase === 'attacker_roll'
    ? combat.attacker_player_id
    : combat.defender_player_id

  const { data: rollerUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', rollingPlayerId)
    .is('on_planet', null)

  const unitTypes = [...new Set((rollerUnits ?? []).map((u: UnitRow) => u.unit_type))]
  const { data: unitDefs } = await db
    .from('units')
    .select('name, combat, afb, sustain_damage')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])

  const technologies = ((player as Record<string, unknown>).technologies as string[]) ?? []
  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))
  let { results, hits } = rollDice(rollerUnits ?? [], defMap, technologies)

  // Phase 43c: apply COMBAT_ROLL commander passives
  const combatRollContext = {
    gameId: body.game_id,
    activatingPlayerId: rollingPlayerId,
    faction: '',
    systemKey: combat.system_key,
    currentDiceResults: results,
    combatRollBonus: undefined as number | undefined,
    pendingWindows: undefined as unknown[] | undefined,
  }
  const { inlineEffects, pendingWindows } = await applyCommanderPassives(
    'COMBAT_ROLL',
    combatRollContext as never,
    db,
  )

  // Run inline handlers so they can mutate combatRollContext (e.g. set combatRollBonus)
  for (const ie of inlineEffects) {
    const effect = (ie as Record<string, unknown>).effect
    if (typeof effect === 'string') {
      try {
        await getHandler(effect)(combatRollContext as never, db)
      } catch {
        // non-fatal — skip effect if handler not registered
      }
    }
  }

  // Apply Winnu commander bonus: +combatRollBonus to each die result
  if (combatRollContext.combatRollBonus) {
    const bonus = combatRollContext.combatRollBonus
    results = results.map((d: DieResult) => ({
      ...d,
      roll: d.roll + bonus,
      hit: (d.roll + bonus) >= d.hit_on,
    }))
    hits = results.filter((d: DieResult) => d.hit).length
  }

  const nextPhase = combat.phase === 'attacker_roll' ? 'defender_assign' : 'attacker_assign'
  const updatePayload = combat.phase === 'attacker_roll'
    ? { attacker_dice: results, attacker_hits: hits, phase: nextPhase }
    : { defender_dice: results, defender_hits: hits, phase: nextPhase }

  const { error } = await db.from('game_combats').update(updatePayload).eq('id', body.combat_id)
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  // Phase 30: Assault Cannon — at start of attacker's first roll, if they have 3+ non-fighter ships
  if (combat.phase === 'attacker_roll' && technologies.includes('Assault Cannon')) {
    const nonFighterCount = (rollerUnits ?? [])
      .filter((u: UnitRow) => u.unit_type !== 'fighter')
      .reduce((s: number, u: UnitRow) => s + u.count, 0)
    if (nonFighterCount >= 3) {
      const opponentId = combat.defender_player_id
      const existing = (combat.pending_effects as Record<string, unknown>) ?? {}
      await db.from('game_combats').update({
        pending_effects: { ...existing, assault_cannon: { must_destroy: 1, non_fighter_only: true, eligible: [opponentId] } }
      }).eq('id', body.combat_id)
    }
  }

  // Phase 30: Duranium Armor — after rolling, repair one damaged ship if any exist
  if (technologies.includes('Duranium Armor')) {
    const { data: damagedShips } = await db.from('game_player_units')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', rollingPlayerId)
      .is('on_planet', null)
      .eq('damaged', true)
      .limit(1)
    if ((damagedShips ?? []).length > 0) {
      await db.from('game_player_units').update({ damaged: false }).eq('id', (damagedShips as Array<{id: string}>)[0].id)
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_ROLL_COMBAT_DICE,
    payload: { player_id: player.id, combat_id: body.combat_id, dice_results: results, hits },
    round: 0,
    phase: 'action',
  })
  return okResponse({
    phase: nextPhase,
    dice: results,
    hits,
    ...(pendingWindows[0] !== undefined ? { pending_window: pendingWindows[0] } : {}),
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
