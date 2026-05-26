import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { resolveUnitStats, type StatBlock } from '../_shared/techEffects.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; afb: string | null }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

type AfbOverride = { dice: number; combat: number }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollAfb(
  units: UnitRow[],
  defMap: Map<string, UnitDef>,
  afbOverrides: Map<string, AfbOverride> = new Map(),
  plasmaScoringUnit?: string,
): { results: DieResult[]; hits: number } {
  const results: DieResult[] = []
  let hits = 0
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.afb) continue

    const override = afbOverrides.get(unit.unit_type)
    let value: number
    let dice: number
    if (override) {
      value = override.combat
      dice = override.dice
    } else {
      const parsed = parseStat(def.afb)
      value = parsed.value
      dice = parsed.dice
    }

    const extraDie = plasmaScoringUnit && unit.unit_type === plasmaScoringUnit ? 1 : 0

    const rollCount = (dice + extraDie) * unit.count
    for (let i = 0; i < rollCount; i++) {
      const roll = Math.ceil(Math.random() * 10)
      const hit = roll >= value
      if (hit) hits++
      results.push({ unit_type: unit.unit_type, roll, hit_on: value, hit })
    }
  }
  return { results, hits }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; plasma_scoring_unit?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  const plasmaScoringUnit = typeof body.plasma_scoring_unit === 'string' ? body.plasma_scoring_unit : undefined

  const { data: player } = await db
    .from('game_players')
    .select('id')
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

  if (combat.phase !== 'barrage') {
    return errorResponse('Combat is not in barrage phase', 409)
  }

  if (combat.barrage_attacker_dice !== null && combat.barrage_attacker_dice !== undefined) {
    return errorResponse('Barrage already fired', 409)
  }

  if ((player as Record<string, string>).id !== combat.attacker_player_id) {
    return errorResponse('Only the attacker can fire barrage', 409)
  }

  const { data: atkUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.attacker_player_id)
    .is('on_planet', null)

  const { data: defUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.defender_player_id)
    .is('on_planet', null)

  const allTypes = [
    ...new Set([
      ...(atkUnits ?? []).map((u: UnitRow) => u.unit_type),
      ...(defUnits ?? []).map((u: UnitRow) => u.unit_type),
    ]),
  ]

  const { data: unitDefs } = await db
    .from('units')
    .select('name, afb')
    .in('name', allTypes.length > 0 ? allTypes : ['__none__'])
    .not('afb', 'is', null)

  if ((unitDefs ?? []).length === 0) {
    return errorResponse('No units with Anti-Fighter Barrage in this system', 409)
  }

  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))

  const { data: attackerPlayer } = await db
    .from('game_players')
    .select('technologies')
    .eq('id', combat.attacker_player_id)
    .maybeSingle()
  const attackerTechs: string[] = attackerPlayer?.technologies ?? []

  const { data: destroyerDef } = await db
    .from('units')
    .select('name, combat, move, capacity, afb, space_cannon, bombardment')
    .eq('name', 'Destroyer')
    .maybeSingle()

  const afbOverrides = new Map<string, AfbOverride>()
  if (destroyerDef) {
    const rawAfbStr: string | null = destroyerDef.afb ?? null
    const parsedAfb = rawAfbStr ? parseStat(rawAfbStr) : null
    const baseStats: StatBlock = {
      combat: destroyerDef.combat ?? 9,
      dice: 1,
      move: destroyerDef.move ?? 2,
      capacity: destroyerDef.capacity ?? 0,
      production: 0,
      sustain: false,
      afb: parsedAfb ? { dice: parsedAfb.dice, combat: parsedAfb.value } : undefined,
    }
    const resolved = resolveUnitStats('Destroyer', baseStats, attackerTechs)
    if (resolved.afb) {
      afbOverrides.set('Destroyer', { dice: resolved.afb.dice, combat: resolved.afb.combat })
    }
  }

  const effectivePlasmaScoringUnit =
    attackerTechs.includes('Plasma Scoring') && plasmaScoringUnit ? plasmaScoringUnit : undefined

  const { results: atkResults, hits: atkHits } = rollAfb(atkUnits ?? [], defMap, afbOverrides, effectivePlasmaScoringUnit)
  const { results: defResults, hits: defHits } = rollAfb(defUnits ?? [], defMap)

  const { pendingWindows } = await applyCommanderPassives(
    'UNIT_ABILITY_ROLL',
    {
      gameId: body.game_id,
      activatingPlayerId: (player as Record<string, string>).id,
      faction: '',
      systemKey: combat.system_key as string,
      currentDiceResults: atkResults,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    db,
  )

  let nextPhase: string
  if (atkHits > 0) {
    nextPhase = 'afb_attacker_assign'
  } else if (defHits > 0) {
    nextPhase = 'afb_defender_assign'
  } else {
    nextPhase = 'attacker_roll'
  }

  await db.from('game_combats').update({
    barrage_attacker_dice: atkResults,
    barrage_attacker_hits: atkHits,
    barrage_defender_dice: defResults,
    barrage_defender_hits: defHits,
    phase: nextPhase,
  }).eq('id', body.combat_id)

  return okResponse({
    barrage_attacker_dice: atkResults,
    barrage_attacker_hits: atkHits,
    barrage_defender_dice: defResults,
    barrage_defender_hits: defHits,
    phase: nextPhase,
    ...(pendingWindows[0] !== undefined ? { pending_window: pendingWindows[0] } : {}),
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
