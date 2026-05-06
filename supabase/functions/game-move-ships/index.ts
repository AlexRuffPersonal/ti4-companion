import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type ShipCargo = { unit_type: string; system_key: string; count: number }
type Ship = { unit_type: string; origin_system_key: string; path: string[]; cargo: ShipCargo[] }
type ExcessRemoval = { unit_type: string; system_key: string; count: number }

function axialNeighbours(key: string): string[] {
  const [q, r] = key.split(',').map(Number)
  return [
    `${q+1},${r-1}`, `${q+1},${r}`, `${q},${r+1}`,
    `${q-1},${r+1}`, `${q-1},${r}`, `${q},${r-1}`,
  ]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; active_system_key?: unknown; ships?: unknown; excess_removals?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.active_system_key || typeof body.active_system_key !== 'string') return errorResponse("'active_system_key' is required")
  if (!Array.isArray(body.ships)) return errorResponse("'ships' is required")

  const ships = body.ships as Ship[]
  const excessRemovals: ExcessRemoval[] = Array.isArray(body.excess_removals) ? body.excess_removals as ExcessRemoval[] : []

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('active_player_id, round, map_tiles')
    .eq('id', body.game_id)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)

  // Bulk fetch all space units for this game
  const { data: allSpaceUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .is('on_planet', null)
  const spaceUnits = allSpaceUnits ?? []

  // Player's activated systems this round
  const { data: activations } = await db
    .from('game_system_activations')
    .select('system_key')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('round', game.round)
  const myTokenSystems = new Set((activations ?? []).map((a: { system_key: string }) => a.system_key))

  // Collect all system keys from ship paths
  const allSystemKeys = new Set<string>()
  allSystemKeys.add(body.active_system_key)
  for (const ship of ships) {
    allSystemKeys.add(ship.origin_system_key)
    for (const hop of ship.path) allSystemKeys.add(hop)
    for (const cargo of ship.cargo) allSystemKeys.add(cargo.system_key)
  }

  // Fetch tile data for all relevant systems
  const mapTiles = game.map_tiles as Record<string, { tile_id: string; tile_number: string }> ?? {}
  const tileIds = [...allSystemKeys]
    .map(key => mapTiles[key]?.tile_id)
    .filter(Boolean) as string[]

  const { data: tileRows } = await db
    .from('tiles')
    .select('id, anomalies, wormholes')
    .in('id', tileIds.length > 0 ? tileIds : ['__none__'])
  const tileIdMap = new Map<string, { anomalies: string[]; wormholes: string[] }>(
    (tileRows ?? []).map((t: { id: string; anomalies: string[]; wormholes: string[] }) => [t.id, t])
  )

  function getTileInfo(systemKey: string) {
    const tileId = mapTiles[systemKey]?.tile_id
    return tileId ? tileIdMap.get(tileId) : undefined
  }

  // Fetch unit definitions
  const unitTypes = [...new Set(ships.map(s => s.unit_type))]
  const { data: unitDefRows } = await db
    .from('units')
    .select('name, move, capacity')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])
  const unitDefs = new Map<string, { move: number; capacity: number }>(
    (unitDefRows ?? []).map((u: { name: string; move: number; capacity: number }) => [u.name, u])
  )

  // Build wormhole adjacency: systems that share a wormhole type are adjacent
  function isAdjacent(a: string, b: string): boolean {
    if (axialNeighbours(a).includes(b)) return true
    const aTile = getTileInfo(a)
    const bTile = getTileInfo(b)
    if (!aTile || !bTile) return false
    return (aTile.wormholes ?? []).some((w: string) => (bTile.wormholes ?? []).includes(w))
  }

  // Enemy-occupied systems
  const enemyPresence = new Set(
    spaceUnits
      .filter((u: { player_id: string }) => u.player_id !== player.id)
      .map((u: { system_key: string }) => u.system_key)
  )

  // Validate each ship
  for (const ship of ships) {
    const def = unitDefs.get(ship.unit_type)
    if (!def) return errorResponse(`Unknown unit type: ${ship.unit_type}`, 400)

    const playerOwnsShip = spaceUnits.some(
      (u: { player_id: string; unit_type: string; system_key: string }) =>
        u.player_id === player.id && u.unit_type === ship.unit_type && u.system_key === ship.origin_system_key
    )
    if (!playerOwnsShip) return errorResponse(`Player does not own ${ship.unit_type} at ${ship.origin_system_key}`, 409)

    if (myTokenSystems.has(ship.origin_system_key) && ship.origin_system_key !== body.active_system_key) {
      return errorResponse(`Origin ${ship.origin_system_key} has a command token`, 409)
    }

    const originTile = getTileInfo(ship.origin_system_key)
    const isOriginNebula = (originTile?.anomalies ?? []).includes('nebula')
    const maxMove = isOriginNebula ? 1 : def.move
    let gravityBonus = 0

    let prevKey = ship.origin_system_key
    const pathWithoutOrigin = ship.path.slice(1)
    for (let hi = 0; hi < pathWithoutOrigin.length; hi++) {
      const hop = pathWithoutOrigin[hi]
      const isLast = hi === pathWithoutOrigin.length - 1

      if (!isAdjacent(prevKey, hop)) {
        return errorResponse(`Hop ${hop} is not adjacent to ${prevKey}`, 409)
      }

      const hopTile = getTileInfo(hop)
      const hopAnoms = hopTile?.anomalies ?? []

      if (hopAnoms.includes('asteroid_field') || hopAnoms.includes('supernova')) {
        return errorResponse(`Cannot enter ${hop} (blocked anomaly)`, 409)
      }
      if (!isLast && hopAnoms.includes('nebula')) {
        return errorResponse(`Cannot pass through nebula at ${hop}`, 409)
      }

      const prevTile = getTileInfo(prevKey)
      if ((prevTile?.anomalies ?? []).includes('gravity_rift')) gravityBonus += 1

      if (!isLast && enemyPresence.has(hop)) {
        return errorResponse(`Cannot pass through enemy-occupied system ${hop}`, 409)
      }

      prevKey = hop
    }

    if (pathWithoutOrigin.length > maxMove + gravityBonus) {
      return errorResponse(`Move distance exceeds ship movement`, 409)
    }
    if (ship.path[ship.path.length - 1] !== body.active_system_key) {
      return errorResponse(`Ship must end movement in active system`, 409)
    }

    let totalCargo = 0
    for (const cargo of ship.cargo) {
      if (!['fighter', 'infantry'].includes(cargo.unit_type)) {
        return errorResponse(`Invalid cargo unit type: ${cargo.unit_type}`, 400)
      }
      if (!ship.path.includes(cargo.system_key)) {
        return errorResponse(`Cargo system ${cargo.system_key} not on ship path`, 409)
      }
      if (myTokenSystems.has(cargo.system_key) && cargo.system_key !== body.active_system_key) {
        return errorResponse(`Cannot pick up cargo from command-token system ${cargo.system_key}`, 409)
      }
      const playerOwnsCargo = spaceUnits.some(
        (u: { player_id: string; unit_type: string; system_key: string; count: number }) =>
          u.player_id === player.id && u.unit_type === cargo.unit_type &&
          u.system_key === cargo.system_key && u.count >= cargo.count
      )
      if (!playerOwnsCargo) return errorResponse(`Player does not own ${cargo.count} ${cargo.unit_type} at ${cargo.system_key}`, 409)
      totalCargo += cargo.count
    }
    if (totalCargo > def.capacity) {
      return errorResponse(`Cargo exceeds ship capacity`, 409)
    }
  }

  // Post-movement capacity check
  const movedShipsByOrigin = new Map<string, number>()
  const activeSysCapacity = ships.reduce((sum, ship) => {
    const def = unitDefs.get(ship.unit_type)!
    const origin = ship.origin_system_key
    movedShipsByOrigin.set(origin, (movedShipsByOrigin.get(origin) ?? 0) + 1)
    return sum + (def.capacity ?? 0)
  }, 0)

  const activeUnitsAfter = spaceUnits.filter(
    (u: { player_id: string; system_key: string }) =>
      u.player_id === player.id && u.system_key === body.active_system_key
  )
  const activeFightersInfantry = activeUnitsAfter.reduce(
    (sum: number, u: { unit_type: string; count: number }) =>
      ['fighter', 'infantry'].includes(u.unit_type) ? sum + u.count : sum, 0
  )
  const totalIncomingCargo = ships.reduce(
    (sum, ship) => sum + ship.cargo.reduce((s, c) => s + c.count, 0), 0
  )
  if (activeFightersInfantry + totalIncomingCargo > activeSysCapacity) {
    const resolved = excessRemovals
      .filter(r => r.system_key === body.active_system_key)
      .reduce((sum, r) => sum + r.count, 0)
    if (activeFightersInfantry + totalIncomingCargo - resolved > activeSysCapacity) {
      return errorResponse('Excess removals insufficient to resolve active system over-capacity', 409)
    }
  }

  // Write pass: move ships
  for (const ship of ships) {
    const unitRow = spaceUnits.find(
      (u: { player_id: string; unit_type: string; system_key: string }) =>
        u.player_id === player.id && u.unit_type === ship.unit_type && u.system_key === ship.origin_system_key
    )
    if (unitRow) {
      await db.from('game_player_units')
        .update({ system_key: body.active_system_key })
        .eq('id', unitRow.id)
    }

    for (const cargo of ship.cargo) {
      const srcRow = spaceUnits.find(
        (u: { player_id: string; unit_type: string; system_key: string }) =>
          u.player_id === player.id && u.unit_type === cargo.unit_type && u.system_key === cargo.system_key
      )
      if (srcRow) {
        if (srcRow.count - cargo.count === 0) {
          await db.from('game_player_units').delete().eq('id', srcRow.id)
        } else {
          await db.from('game_player_units').update({ count: srcRow.count - cargo.count }).eq('id', srcRow.id)
        }
        await db.from('game_player_units').upsert({
          game_id: body.game_id, player_id: player.id,
          unit_type: cargo.unit_type, system_key: body.active_system_key,
          count: cargo.count, on_planet: null,
        }, { onConflict: 'game_id,player_id,unit_type,system_key,on_planet' })
      }
    }
  }

  // Apply excess removals
  for (const removal of excessRemovals) {
    const row = spaceUnits.find(
      (u: { player_id: string; unit_type: string; system_key: string }) =>
        u.player_id === player.id && u.unit_type === removal.unit_type && u.system_key === removal.system_key
    )
    if (row) {
      if (row.count - removal.count <= 0) {
        await db.from('game_player_units').delete().eq('id', row.id)
      } else {
        await db.from('game_player_units').update({ count: row.count - removal.count }).eq('id', row.id)
      }
    }
  }

  return okResponse({ moved: true, units_removed: excessRemovals })
})
