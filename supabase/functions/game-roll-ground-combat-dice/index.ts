import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { resolveUnitStats } from '../_shared/techEffects.ts'
import { logEvent, EVT_ROLL_GROUND_COMBAT_DICE } from '../_shared/gameEvents.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; combat: string | null; sustain_damage: boolean; planetary_shield?: boolean }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollDice(
  units: UnitRow[],
  defMap: Map<string, UnitDef>,
  technologies: string[]
): { results: DieResult[]; hits: number; valueMap: Map<string, number> } {
  const results: DieResult[] = []
  let hits = 0
  const valueMap = new Map<string, number>()
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.combat) continue
    const { value, dice } = parseStat(def.combat)
    // Wire resolveUnitStats for future upgrade support (currently a pass-through stub)
    const statBlock = resolveUnitStats(unit.unit_type, {
      combat: value, dice, move: 0, capacity: 0, production: 0, sustain: def.sustain_damage ?? false,
    }, technologies)
    const resolvedValue = statBlock.combat
    const resolvedDice = statBlock.dice
    valueMap.set(unit.unit_type, resolvedValue)
    const rollCount = resolvedDice * unit.count
    for (let i = 0; i < rollCount; i++) {
      const roll = Math.ceil(Math.random() * 10)
      const hit = roll >= resolvedValue
      if (hit) hits++
      results.push({ unit_type: unit.unit_type, roll, hit_on: resolvedValue, hit })
    }
  }
  return { results, hits, valueMap }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  const selections = (body.selections ?? {}) as Record<string, unknown>

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

  if (combat.combat_type !== 'ground') {
    return errorResponse('Combat is not a ground combat', 409)
  }

  const rollPhases = ['attacker_roll', 'defender_roll']
  if (!rollPhases.includes(combat.phase)) {
    return errorResponse('Combat is not a roll phase', 409)
  }

  if (combat.phase === 'attacker_roll' && player.id !== combat.attacker_player_id) {
    return errorResponse('Not your roll — attacker must roll', 409)
  }
  if (combat.phase === 'defender_roll' && player.id !== combat.defender_player_id) {
    return errorResponse('Not your roll — defender must roll', 409)
  }

  const rollingPlayerId = combat.phase === 'attacker_roll'
    ? combat.attacker_player_id
    : combat.defender_player_id
  const opponentPlayerId = combat.phase === 'attacker_roll'
    ? combat.defender_player_id
    : combat.attacker_player_id

  // ── Magen Defense Grid ───────────────────────────────────────────────────────
  // When it's the attacker_roll phase, the defender may skip the attacker's roll
  // by using Magen Defense Grid (if a planetary_shield unit is present on the planet).
  if (combat.phase === 'attacker_roll' && selections.use_magen === true) {
    // Load defender player record to check tech ownership
    const { data: defenderPlayer } = await db
      .from('game_players')
      .select('id, technologies, exhausted_technologies')
      .eq('game_id', body.game_id)
      .eq('id', opponentPlayerId)
      .maybeSingle()
    const defenderTechs: string[] = defenderPlayer?.technologies ?? []
    const defenderExhausted: string[] = defenderPlayer?.exhausted_technologies ?? []
    if (defenderTechs.includes('Magen Defense Grid') && !defenderExhausted.includes('Magen Defense Grid')) {
      // Check if any defender unit on the planet has planetary_shield
      const { data: defenderUnits } = await db
        .from('game_player_units')
        .select('id, player_id, unit_type, count, system_key')
        .eq('game_id', body.game_id)
        .eq('system_key', combat.system_key)
        .eq('player_id', opponentPlayerId)
        .eq('on_planet', combat.planet_name)
      const defUnitTypes = [...new Set((defenderUnits ?? []).map((u: UnitRow) => u.unit_type))]
      const { data: defUnitDefs } = await db
        .from('units')
        .select('name, planetary_shield')
        .in('name', defUnitTypes.length > 0 ? defUnitTypes : ['__none__'])
      const hasPlanetaryShield = (defUnitDefs ?? []).some((d: { name: string; planetary_shield?: boolean }) => d.planetary_shield)
      if (hasPlanetaryShield) {
        // Exhaust Magen Defense Grid for the defender
        const newExhausted = [...defenderExhausted, 'Magen Defense Grid']
        await db.from('game_players').update({ exhausted_technologies: newExhausted }).eq('id', opponentPlayerId)
        // Advance phase, skipping the attacker's roll (0 hits, empty dice)
        const nextPhase = 'defender_assign'
        const updatePayload = { attacker_dice: [], attacker_hits: 0, phase: nextPhase }
        const { error } = await db.from('game_combats').update(updatePayload).eq('id', body.combat_id)
        if (error) return errorResponse(`Update failed: ${error.message}`, 500)
        await logEvent(db, {
          game_id: body.game_id,
          player_id: player.id,
          event_type: EVT_ROLL_GROUND_COMBAT_DICE,
          payload: { player_id: player.id, combat_id: body.combat_id, dice_results: [], hits: 0 },
          round: 0,
          phase: 'action',
        })
        return okResponse({ phase: nextPhase, dice: [], hits: 0, magen_applied: true })
      }
    }
  }

  // ── Load rolling player's units ───────────────────────────────────────────────
  const { data: rollerUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', rollingPlayerId)
    .eq('on_planet', combat.planet_name)

  const unitTypes = [...new Set((rollerUnits ?? []).map((u: UnitRow) => u.unit_type))]
  const { data: unitDefs } = await db
    .from('units')
    .select('name, combat, sustain_damage')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])

  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))
  const technologies: string[] = player.technologies ?? []
  const exhaustedTechs: string[] = player.exhausted_technologies ?? []

  let { results, hits, valueMap } = rollDice(rollerUnits ?? [], defMap, technologies)

  // ── Supercharge: +1 to all rolls ─────────────────────────────────────────────
  if (technologies.includes('Supercharge') && !exhaustedTechs.includes('Supercharge') && selections.use_supercharge === true) {
    // Apply +1 to each roll result and re-evaluate hits
    results = results.map(r => {
      const newRoll = r.roll + 1
      const threshold = valueMap.get(r.unit_type) ?? 6
      return { ...r, roll: newRoll, hit: newRoll >= threshold }
    })
    hits = results.filter(r => r.hit).length
    // Exhaust Supercharge
    const newExhausted = [...exhaustedTechs, 'Supercharge']
    await db.from('game_players').update({ exhausted_technologies: newExhausted }).eq('id', rollingPlayerId)
  }

  // ── Valkyrie Particle Weave: +1 hit if opponent had hits ─────────────────────
  // If rolling player (attacker) looks at combat.defender_hits from last round.
  // If rolling player (defender) looks at combat.attacker_hits (just set this round).
  if (technologies.includes('Valkyrie Particle Weave')) {
    const opponentHits = combat.phase === 'attacker_roll'
      ? (combat.defender_hits ?? 0)
      : (combat.attacker_hits ?? 0)
    if (opponentHits > 0) {
      hits += 1
    }
  }

  // ── Duranium Armor ────────────────────────────────────────────────────────────
  // Repair logic is triggered after hit assignment; handled by game-assign-hits.

  // Phase 43c: apply COMBAT_ROLL commander passives (same pattern as space combat)
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

  // Merge pendingWindows from applyCommanderPassives and from inline handlers (e.g. Jol-Nar)
  const allPendingWindows = [
    ...pendingWindows,
    ...(combatRollContext.pendingWindows ?? [])
  ]

  // Apply Winnu commander bonus: +combatRollBonus to each die result
  if (combatRollContext.combatRollBonus !== undefined && combatRollContext.combatRollBonus !== 0) {
    const bonus = combatRollContext.combatRollBonus
    results = results.map((d: DieResult) => ({
      ...d,
      roll: d.roll + bonus,
      hit: (d.roll + bonus) >= d.hit_on,
    }))
    hits = results.filter((d: DieResult) => d.hit).length
  }

  // ── Tekklar Legion ───────────────────────────────────────────────────────────
  // If tekklar_holder_player_id is set, adjust all die results:
  // Holder's rolls: +1 to each die value (capped at 10)
  // Owner's (Sardakk) rolls: −1 from each die value (floor at 1)
  const tekklarHolderId = (combat as Record<string, unknown>).tekklar_holder_player_id as string | null
  if (tekklarHolderId) {
    if (player.id === tekklarHolderId) {
      results = results.map((r: DieResult) => {
        const newRoll = Math.min(10, r.roll + 1)
        return { ...r, roll: newRoll, hit: newRoll >= r.hit_on }
      })
    } else {
      results = results.map((r: DieResult) => {
        const newRoll = Math.max(1, r.roll - 1)
        return { ...r, roll: newRoll, hit: newRoll >= r.hit_on }
      })
    }
    hits = results.filter((r: DieResult) => r.hit).length
  }

  const nextPhase = combat.phase === 'attacker_roll' ? 'defender_assign' : 'attacker_assign'
  const updatePayload = combat.phase === 'attacker_roll'
    ? { attacker_dice: results, attacker_hits: hits, phase: nextPhase }
    : { defender_dice: results, defender_hits: hits, phase: nextPhase }

  const { error } = await db.from('game_combats').update(updatePayload).eq('id', body.combat_id)
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_ROLL_GROUND_COMBAT_DICE,
    payload: { player_id: player.id, combat_id: body.combat_id, dice_results: results, hits },
    round: 0,
    phase: 'action',
  })
  return okResponse({ phase: nextPhase, dice: results, hits, ...(allPendingWindows[0] !== undefined ? { pending_window: allPendingWindows[0] } : {}) })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
