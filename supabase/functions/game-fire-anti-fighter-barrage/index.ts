import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; afb: string | null }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollAfb(units: UnitRow[], defMap: Map<string, UnitDef>): { results: DieResult[]; hits: number } {
  const results: DieResult[] = []
  let hits = 0
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.afb) continue
    const { value, dice } = parseStat(def.afb)
    const rollCount = dice * unit.count
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

  let body: { game_id?: unknown; combat_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")

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

  // Query attacker and defender units in space area
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

  // Get all distinct unit types from both sides
  const allTypes = [
    ...new Set([
      ...(atkUnits ?? []).map((u: UnitRow) => u.unit_type),
      ...(defUnits ?? []).map((u: UnitRow) => u.unit_type),
    ]),
  ]

  // Query unit defs that have AFB
  const { data: unitDefs } = await db
    .from('units')
    .select('name, afb')
    .in('name', allTypes.length > 0 ? allTypes : ['__none__'])
    .not('afb', 'is', null)

  if ((unitDefs ?? []).length === 0) {
    return errorResponse('No units with Anti-Fighter Barrage in this system', 409)
  }

  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))

  // Roll AFB simultaneously for both sides
  const { results: atkResults, hits: atkHits } = rollAfb(atkUnits ?? [], defMap)
  const { results: defResults, hits: defHits } = rollAfb(defUnits ?? [], defMap)

  // Determine next phase — do NOT auto-destroy fighters
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
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
