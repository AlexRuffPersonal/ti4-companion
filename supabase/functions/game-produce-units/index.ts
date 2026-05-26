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

  let body: { game_id?: unknown; system_key?: unknown; units?: unknown; planet_exhausts?: unknown; selections?: unknown; trade_goods_spend?: unknown; warfare_secondary?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!Array.isArray(body.units) || body.units.length === 0) return errorResponse("'units' must be a non-empty array")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, trade_goods')
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

  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

  if (body.warfare_secondary === true) {
    const { data: warfarePlay, error: playError } = await db
      .from('game_strategy_card_plays')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('card_number', 6)
      .eq('status', 'active')
      .eq('round', game.round)
      .maybeSingle()
    if (playError) return errorResponse('Database error', 500)
    if (!warfarePlay) return errorResponse('No active Warfare play', 409)

    const { data: usedResponse, error: responseError } = await db
      .from('game_strategy_card_responses')
      .select('id')
      .eq('play_id', (warfarePlay as Record<string, unknown>).id)
      .eq('player_id', (player as Record<string, unknown>).id)
      .eq('status', 'used')
      .maybeSingle()
    if (responseError) return errorResponse('Database error', 500)
    if (!usedResponse) return errorResponse('Warfare secondary not used', 409)
  } else {
    if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)

    const { data: activation, error: activationError } = await db
      .from('game_system_activations')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, unknown>).id)
      .eq('system_key', body.system_key)
      .eq('round', game.round)
      .maybeSingle()
    if (activationError) return errorResponse('Database error', 500)
    if (!activation) return errorResponse('System not activated by you this round', 409)
  }

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
    .eq('player_id', (player as Record<string, unknown>).id)
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

  // Aerie Hololattice: +1 capacity per planet with structures in this system
  const heldTechs = (player.technologies ?? []) as string[]
  const exhaustedTechs = (player.exhausted_technologies ?? []) as string[]
  const hasAerieHololattice = heldTechs.includes('Aerie Hololattice')
  if (hasAerieHololattice) {
    const { data: structureUnits } = await db
      .from('game_player_units')
      .select('on_planet, unit_type')
      .eq('game_id', body.game_id)
      .eq('system_key', body.system_key)
      .eq('player_id', (player as Record<string, unknown>).id)
      .in('unit_type', ['space dock', 'pds'])
    const structurePlanets = new Set(((structureUnits ?? []) as Array<{ on_planet: string | null }>)
      .filter(u => u.on_planet != null)
      .map(u => u.on_planet as string))
    totalCapacity += structurePlanets.size
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
      .eq('player_id', (player as Record<string, unknown>).id)
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

  // Tech effects on cost
  let effectiveCost = totalCost

  // Sarween Tools: reduce cost by 1 (min 0)
  if (heldTechs.includes('Sarween Tools')) {
    effectiveCost = Math.max(0, effectiveCost - 1)
  }

  // AI Development Algorithm (exhausted): reduce by count of unit_upgrade techs
  if (heldTechs.includes('AI Development Algorithm') && exhaustedTechs.includes('AI Development Algorithm')) {
    const { data: upgradeTechs } = await db
      .from('technologies')
      .select('name')
      .in('name', heldTechs)
      .eq('technology_type', 'unit_upgrade')
    const upgradeCount = (upgradeTechs ?? []).length
    effectiveCost = Math.max(0, effectiveCost - upgradeCount)
  }

  // Mirror Computing: each TG spent counts as 2 resources
  const hasMirrorComputing = heldTechs.includes('Mirror Computing')
  const tgSpend = typeof body.trade_goods_spend === 'number' ? body.trade_goods_spend : 0
  const tgContribution = hasMirrorComputing ? tgSpend * 2 : tgSpend
  totalResources += tgContribution

  if (totalResources < effectiveCost) return errorResponse('Insufficient resources', 409)

  // Deduct trade goods if spent
  if (tgSpend > 0) {
    await db
      .from('game_players')
      .update({ trade_goods: ((player as Record<string, unknown>).trade_goods as number) - tgSpend })
      .eq('id', (player as Record<string, unknown>).id)
  }

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
      .neq('player_id', (player as Record<string, unknown>).id)
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
      .eq('player_id', (player as Record<string, unknown>).id)
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
      .eq('player_id', (player as Record<string, unknown>).id)
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
          player_id: (player as Record<string, unknown>).id,
          system_key: body.system_key,
          unit_type: order.unit_type,
          count: order.count,
          on_planet: onPlanet,
        })
      if (insertError) return errorResponse(`Failed to insert units: ${insertError.message}`, 500)
    }
  }

  const selections = (body.selections ?? {}) as Record<string, unknown>

  // Yin Spinner: place 1 infantry on a controlled planet in this system
  if (heldTechs.includes('Yin Spinner') && typeof selections.yin_spinner_planet === 'string' && selections.yin_spinner_planet) {
    const yinPlanet = selections.yin_spinner_planet as string
    const { data: existingInf } = await db
      .from('game_player_units')
      .select('id, count')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, unknown>).id)
      .eq('system_key', body.system_key)
      .eq('unit_type', 'infantry')
      .eq('on_planet', yinPlanet)
      .maybeSingle()
    if (existingInf) {
      await db
        .from('game_player_units')
        .update({ count: (existingInf as { count: number }).count + 1 })
        .eq('id', (existingInf as { id: string }).id)
    } else {
      await db
        .from('game_player_units')
        .insert({
          game_id: body.game_id,
          player_id: (player as Record<string, unknown>).id,
          system_key: body.system_key,
          unit_type: 'infantry',
          count: 1,
          on_planet: yinPlanet,
        })
    }
  }

  // Self-Assembly Routines: place 1 mech and exhaust the tech
  if (
    heldTechs.includes('Self-Assembly Routines') &&
    !exhaustedTechs.includes('Self-Assembly Routines') &&
    selections.self_assembly_exhaust === true
  ) {
    if (typeof selections.self_assembly_planet === 'string') {
      const sarPlanet = selections.self_assembly_planet as string
      const { data: existingMech } = await db
        .from('game_player_units')
        .select('id, count')
        .eq('game_id', body.game_id)
        .eq('player_id', (player as Record<string, unknown>).id)
        .eq('system_key', body.system_key)
        .eq('unit_type', 'mech')
        .eq('on_planet', sarPlanet)
        .maybeSingle()
      if (existingMech) {
        await db
          .from('game_player_units')
          .update({ count: (existingMech as { count: number }).count + 1 })
          .eq('id', (existingMech as { id: string }).id)
      } else {
        await db
          .from('game_player_units')
          .insert({
            game_id: body.game_id,
            player_id: (player as Record<string, unknown>).id,
            system_key: body.system_key,
            unit_type: 'mech',
            count: 1,
            on_planet: sarPlanet,
          })
      }
    }
    await db
      .from('game_players')
      .update({ exhausted_technologies: [...exhaustedTechs, 'Self-Assembly Routines'] })
      .eq('id', (player as Record<string, unknown>).id)
  }

  // Magmus Reactor: +1 TG if system has a war sun owned by this player
  if (heldTechs.includes('Magmus Reactor')) {
    const { data: warSuns } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', body.system_key)
      .eq('player_id', (player as Record<string, unknown>).id)
      .eq('unit_type', 'war sun')
    if ((warSuns ?? []).length > 0) {
      await db
        .from('game_players')
        .update({ trade_goods: ((player as Record<string, unknown>).trade_goods as number) + 1 })
        .eq('id', (player as Record<string, unknown>).id)
    }
  }

  return okResponse({ produced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
