import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitOrder = { unit_type: string; count: number; on_planet?: string | null }
type UnitDef = { name: string; cost: number; production: string | null; unit_type: string | null }
type PlanetInfo = { name: string; resources: number }

function parseStat(text: string): number {
  const match = text.match(/^(\d+)/)
  return match ? parseInt(match[1]) : 0
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; system_key?: unknown; units?: unknown; planet_exhausts?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!Array.isArray(body.units) || body.units.length === 0) return errorResponse("'units' must be a non-empty array")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, active_player_id, round, map_tiles')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

  // ACTIVATION
  const { data: activation, error: activationError } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('system_key', body.system_key)
    .eq('round', game.round)
    .maybeSingle()
  if (activationError) return errorResponse('Database error', 500)
  if (!activation) return errorResponse('System not activated by you this round', 409)

  // TILE_ID
  const mapTiles = game.map_tiles as Record<string, { tile_id: string }> | null
  const tileEntry = mapTiles?.[body.system_key]
  if (!tileEntry) return errorResponse('System not found in map', 409)

  const { data: tile, error: tileError } = await db
    .from('tiles')
    .select('planets')
    .eq('id', tileEntry.tile_id)
    .maybeSingle()
  if (tileError) return errorResponse('Database error', 500)
  if (!tile) return errorResponse('Tile not found', 404)

  // Fetch unit definitions for all requested unit types
  const unitOrders = body.units as UnitOrder[]
  const unitNames = [...new Set(unitOrders.map(u => u.unit_type))]
  const { data: unitDefs, error: unitDefError } = await db
    .from('units')
    .select('name, cost, production, unit_type')
    .in('name', unitNames)
  if (unitDefError) return errorResponse('Database error', 500)
  const defMap = new Map<string, UnitDef>()
  for (const def of unitDefs ?? []) defMap.set((def as UnitDef).name, def as UnitDef)

  // Compute production capacity
  const { data: callerUnits, error: callerUnitsError } = await db
    .from('game_player_units')
    .select('unit_type, count')
    .eq('game_id', body.game_id)
    .eq('system_key', body.system_key)
    .eq('player_id', (player as Record<string, string>).id)
  if (callerUnitsError) return errorResponse('Database error', 500)

  // Fetch defs for units in the system (may differ from units being produced)
  const systemUnitNames = [...new Set(((callerUnits ?? []) as Array<{ unit_type: string }>).map(u => u.unit_type))]
  const { data: systemUnitDefs, error: systemDefError } = await db
    .from('units')
    .select('name, production')
    .in('name', systemUnitNames)
  if (systemDefError) return errorResponse('Database error', 500)
  const systemDefMap = new Map<string, { production: string | null }>()
  for (const def of systemUnitDefs ?? []) systemDefMap.set((def as { name: string }).name, def as { production: string | null })

  let totalCapacity = 0
  for (const unit of callerUnits ?? []) {
    const def = systemDefMap.get((unit as { unit_type: string }).unit_type)
    if (def?.production) totalCapacity += parseStat(def.production)
  }
  if (totalCapacity === 0) return errorResponse('No production-capable units in system', 409)

  const totalToProduce = unitOrders.reduce((sum, u) => sum + u.count, 0)
  if (totalToProduce > totalCapacity) return errorResponse('Exceeds production capacity', 409)

  // Validate resource payment
  const planetExhausts = (body.planet_exhausts ?? []) as string[]
  const tilePlanets = ((tile.planets ?? []) as PlanetInfo[])
  const tileResourceMap = new Map<string, number>()
  for (const p of tilePlanets) tileResourceMap.set(p.name, p.resources ?? 0)

  let totalResources = 0
  for (const planetName of planetExhausts) {
    const resources = tileResourceMap.get(planetName)
    if (resources === undefined) return errorResponse(`Planet ${planetName} not in system`, 409)
    totalResources += resources
  }

  // Also validate that these planets are owned by caller
  if (planetExhausts.length > 0) {
    const { data: ownedPlanets, error: ownedError } = await db
      .from('game_player_planets')
      .select('planet_name')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, string>).id)
      .in('planet_name', planetExhausts)
    if (ownedError) return errorResponse('Database error', 500)
    const ownedSet = new Set(((ownedPlanets ?? []) as Array<{ planet_name: string }>).map(p => p.planet_name))
    for (const name of planetExhausts) {
      if (!ownedSet.has(name)) return errorResponse(`Planet ${name} not owned by you`, 409)
    }
  }

  let totalCost = 0
  for (const order of unitOrders) {
    const def = defMap.get(order.unit_type)
    if (!def) return errorResponse(`Unknown unit type: ${order.unit_type}`, 409)
    totalCost += (def.cost ?? 0) * order.count
  }
  if (totalResources < totalCost) return errorResponse('Insufficient resources', 409)

  // Validate no ships produced in enemy-occupied system
  const shipOrders = unitOrders.filter(u => {
    const def = defMap.get(u.unit_type)
    return def?.unit_type === 'ship'
  })
  if (shipOrders.length > 0) {
    const { data: enemyUnits, error: enemyError } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', body.system_key)
      .neq('player_id', (player as Record<string, string>).id)
      .limit(1)
    if (enemyError) return errorResponse('Database error', 500)
    if ((enemyUnits ?? []).length > 0) return errorResponse('Cannot produce ships in enemy-occupied system', 409)
  }

  // Validate ground forces have on_planet specified
  for (const order of unitOrders) {
    const def = defMap.get(order.unit_type)
    if (def?.unit_type === 'ground' && !order.on_planet) {
      return errorResponse(`Ground unit ${order.unit_type} requires on_planet`, 409)
    }
  }

  // Exhaust payment planets
  if (planetExhausts.length > 0) {
    const { error: exhaustError } = await db
      .from('game_player_planets')
      .update({ exhausted: true })
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, string>).id)
      .in('planet_name', planetExhausts)
    if (exhaustError) return errorResponse(`Failed to exhaust planets: ${exhaustError.message}`, 500)
  }

  // Place produced units
  for (const order of unitOrders) {
    const onPlanet = order.on_planet ?? null
    const { data: existing } = await db
      .from('game_player_units')
      .select('id, count')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, string>).id)
      .eq('system_key', body.system_key)
      .eq('unit_type', order.unit_type)
      .is('on_planet', onPlanet)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await db
        .from('game_player_units')
        .update({ count: (existing as { count: number }).count + order.count })
        .eq('id', (existing as { id: string }).id)
      if (updateError) return errorResponse(`Failed to update units: ${updateError.message}`, 500)
    } else {
      const { error: insertError } = await db
        .from('game_player_units')
        .insert({
          game_id: body.game_id,
          player_id: (player as Record<string, string>).id,
          system_key: body.system_key,
          unit_type: order.unit_type,
          count: order.count,
          on_planet: onPlanet,
        })
      if (insertError) return errorResponse(`Failed to insert units: ${insertError.message}`, 500)
    }
  }

  return okResponse({ produced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
