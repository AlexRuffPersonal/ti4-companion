import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; space_cannon: string | null }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
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

  if (combat.combat_type !== 'ground') return errorResponse('Not a ground combat', 409)
  if (combat.phase !== 'scd_fire') return errorResponse('Combat is not in Space Cannon Defense phase', 409)
  if (player.id !== combat.defender_player_id) return errorResponse('Only the defender can fire Space Cannon Defense', 409)

  const { data: defUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('on_planet', combat.planet_name)
    .eq('player_id', combat.defender_player_id)

  const defUnitRows: UnitRow[] = defUnits ?? []
  const defTypes = [...new Set(defUnitRows.map((u) => u.unit_type))]

  const { data: scdDefsRaw } = await db
    .from('units')
    .select('name, space_cannon')
    .in('name', defTypes.length > 0 ? defTypes : ['__none__'])
    .not('space_cannon', 'is', null)

  const scdDefs: UnitDef[] = scdDefsRaw ?? []
  if (scdDefs.length === 0) return errorResponse('No Space Cannon units on this planet', 409)

  const defMap = new Map(scdDefs.map((u) => [u.name, u]))

  const results: DieResult[] = []
  let hits = 0

  for (const unit of defUnitRows) {
    const def = defMap.get(unit.unit_type)
    if (!def?.space_cannon) continue
    const { value, dice } = parseStat(def.space_cannon)
    const rollCount = dice * unit.count
    for (let i = 0; i < rollCount; i++) {
      const roll = Math.ceil(Math.random() * 10)
      const hit = roll >= value
      if (hit) hits++
      results.push({ unit_type: unit.unit_type, roll, hit_on: value, hit })
    }
  }

  const nextPhase = hits > 0 ? 'scd_assign' : 'attacker_roll'

  await db
    .from('game_combats')
    .update({ scd_dice: results, scd_hits: hits, phase: nextPhase })
    .eq('id', body.combat_id)

  return okResponse({ scd_dice: results, scd_hits: hits })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
