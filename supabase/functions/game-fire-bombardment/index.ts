import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; bombardment: string | null }
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollBombardment(units: UnitRow[], defMap: Map<string, UnitDef>): { results: DieResult[]; hits: number } {
  const results: DieResult[] = []
  let hits = 0
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.bombardment) continue
    const { value, dice } = parseStat(def.bombardment)
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

  let body: { game_id?: unknown; system_key?: unknown; planet_name?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!body.planet_name || typeof body.planet_name !== 'string') return errorResponse("'planet_name' is required")

  const gameId = body.game_id
  const systemKey = body.system_key
  const planetName = body.planet_name

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('round, map_tiles')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  // ACTIVATION: caller must have activated this system this round
  const { data: activation } = await db
    .from('game_system_activations')
    .select('*')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('round', game.round)
    .maybeSingle()
  if (!activation) return errorResponse('System not activated by caller', 409)

  // TILE_ID
  const tileId = (game.map_tiles as Record<string, { tile_id: number }>)[systemKey]?.tile_id
  if (!tileId) return errorResponse('System not in map', 409)

  // TILE
  const { data: tile } = await db
    .from('tiles')
    .select('planets')
    .eq('id', tileId)
    .maybeSingle()
  if (!tile) return errorResponse('Tile not found', 404)

  // PLANET_EXISTS
  const planet = (tile.planets as Array<{ name: string }>)?.find(p => p.name === planetName)
  if (!planet) return errorResponse('Planet not found in system', 409)

  // Must not have already fired a bombardment row for this planet
  const { data: existing } = await db
    .from('game_combats')
    .select('id')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('combat_type', 'bombardment')
    .eq('planet_name', planetName)
    .maybeSingle()
  if (existing) return errorResponse('Planet already bombarded this invasion', 409)

  // Need defender ground forces to bombard
  const { data: defenderUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('on_planet', planetName)
    .neq('player_id', (player as Record<string, string>).id)
  if ((defenderUnits ?? []).length === 0) {
    return errorResponse('No ground forces to bombard on this planet', 409)
  }

  // Apply commander passives for BOMBARDMENT trigger (e.g. L1Z1X: skip planetary shield)
  const bombardmentContext: Record<string, unknown> = {
    gameId,
    activatingPlayerId: (player as Record<string, string>).id,
    faction: '',
  }
  const { inlineEffects } = await applyCommanderPassives('BOMBARDMENT', bombardmentContext as any, db)
  const skipShield = inlineEffects.some((e: any) => e.effect === 'l1z1x_skip_planetary_shield')

  if (!skipShield) {
    // Planetary Shield check
    const defTypes = [...new Set((defenderUnits ?? []).map((u: UnitRow) => u.unit_type))]
    const { data: shieldDefs } = await db
      .from('units')
      .select('name')
      .in('name', defTypes.length > 0 ? defTypes : ['__none__'])
      .eq('planetary_shield', true)

    if ((shieldDefs ?? []).length > 0) {
      // War Suns negate Planetary Shield
      const { data: atkSpaceUnitsForShield } = await db
        .from('game_player_units')
        .select('id, player_id, unit_type, count, system_key')
        .eq('game_id', gameId)
        .eq('system_key', systemKey)
        .eq('player_id', (player as Record<string, string>).id)
        .is('on_planet', null)
      const atkTypesForShield = [...new Set((atkSpaceUnitsForShield ?? []).map((u: UnitRow) => u.unit_type))]
      const { data: warSunDefs } = await db
        .from('units')
        .select('name')
        .eq('name', 'war_sun')
        .in('name', atkTypesForShield.length > 0 ? atkTypesForShield : ['__none__'])
      if ((warSunDefs ?? []).length === 0) {
        return errorResponse('Planetary Shield is active — cannot bombard', 409)
      }
    }
  }

  // Roll bombardment dice — query attacker space units
  const { data: atkSpaceUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .is('on_planet', null)

  const atkTypes = [...new Set((atkSpaceUnits ?? []).map((u: UnitRow) => u.unit_type))]
  const { data: bombDefs } = await db
    .from('units')
    .select('name, bombardment')
    .in('name', atkTypes.length > 0 ? atkTypes : ['__none__'])
    .not('bombardment', 'is', null)

  if ((bombDefs ?? []).length === 0) {
    return errorResponse('No units with Bombardment ability in space area', 409)
  }

  const defMap = new Map((bombDefs ?? []).map((u: UnitDef) => [u.name, u]))
  const { results, hits } = rollBombardment(atkSpaceUnits ?? [], defMap)

  // Apply commander passives for UNIT_ABILITY_ROLL trigger (e.g. Argent Flight: add_die, Jol-Nar: reroll window)
  const { pendingWindows } = await applyCommanderPassives(
    'UNIT_ABILITY_ROLL',
    { ...bombardmentContext, currentDiceResults: results } as any,
    db,
  )

  const defenderId = (defenderUnits as UnitRow[])[0].player_id
  const phase = hits > 0 ? 'bombardment_assign' : 'complete'

  const { data: inserted, error: insertError } = await db
    .from('game_combats')
    .insert({
      game_id: gameId,
      system_key: systemKey,
      combat_type: 'bombardment',
      planet_name: planetName,
      attacker_player_id: (player as Record<string, string>).id,
      defender_player_id: defenderId,
      phase,
      attacker_dice: results,
      attacker_hits: hits,
      round: game.round,
    })
    .select('id')
    .maybeSingle()
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({
    combat_id: (inserted as Record<string, string>).id,
    dice: results,
    hits,
    pending_window: pendingWindows[0] ?? undefined,
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
