import { useState } from 'react'
import { moveShips as moveShipsFn } from '../lib/edgeFunctions.js'

export function useMovement(gameId, game, tileData, mapTiles, allSpaceUnits, myPlayerId, myTokenSystems) {
  const [selectedShips, setSelectedShips] = useState([])
  const [excessRemovals, setExcessRemovals] = useState([])

  function axialNeighbors(systemKey) {
    const [q, r] = systemKey.split(',').map(Number)
    return [
      `${q+1},${r}`, `${q-1},${r}`,
      `${q},${r+1}`, `${q},${r-1}`,
      `${q+1},${r-1}`, `${q-1},${r+1}`,
    ]
  }

  function wormholeNeighbors(systemKey) {
    const myTileId = mapTiles[systemKey]?.tile_id
    const myWormholes = tileData[myTileId]?.wormholes ?? []
    if (myWormholes.length === 0) return []
    return Object.entries(mapTiles)
      .filter(([sk]) => sk !== systemKey)
      .filter(([sk]) => {
        const tid = mapTiles[sk]?.tile_id
        const wh = tileData[tid]?.wormholes ?? []
        return wh.some(w => myWormholes.includes(w))
      })
      .map(([sk]) => sk)
  }

  function isAdjacent(a, b) {
    return axialNeighbors(a).includes(b) || wormholeNeighbors(a).includes(b)
  }

  function tileAnomaly(systemKey) {
    const tileId = mapTiles[systemKey]?.tile_id
    return tileData[tileId]?.anomalies ?? []
  }

  function isBlocked(systemKey) {
    const anomalies = tileAnomaly(systemKey)
    return anomalies.includes('asteroid_field') || anomalies.includes('supernova')
  }

  function isNebula(systemKey) {
    return tileAnomaly(systemKey).includes('nebula')
  }

  function isGravityRift(systemKey) {
    return tileAnomaly(systemKey).includes('gravity_rift')
  }

  function effectiveMoveValue(ship) {
    return isNebula(ship.origin_system_key) ? 1 : (ship.moveValue ?? 1)
  }

  function gravityBonus(path) {
    return path.slice(0, -1).filter(sk => isGravityRift(sk)).length
  }

  function reachableSystems(ship, currentPath) {
    const last = currentPath[currentPath.length - 1]
    const stepsUsed = currentPath.length - 1
    const maxSteps = effectiveMoveValue(ship) + gravityBonus(currentPath)
    if (stepsUsed >= maxSteps) return []
    const enemySystems = new Set(
      allSpaceUnits.filter(u => u.player_id !== myPlayerId).map(u => u.system_key)
    )
    const candidates = [...new Set([...axialNeighbors(last), ...wormholeNeighbors(last)])]
    return candidates
      .filter(sk => isAdjacent(last, sk))
      .filter(sk => !isBlocked(sk))
      .filter(sk => !(isNebula(sk) && stepsUsed + 1 < maxSteps))
      .filter(sk => !enemySystems.has(sk))
  }

  function capacityRemaining(ship) {
    const cap = ship.capacity ?? 0
    return cap - (ship.cargo ?? []).reduce((s, c) => s + c.count, 0)
  }

  function excessBySystem() {
    // After ships move, check if remaining units in each system exceed capacity
    // This is a simplified implementation for planning purposes
    const result = {}
    for (const ship of selectedShips) {
      const dest = ship.path[ship.path.length - 1] ?? ship.origin_system_key
      const cap = ship.capacity ?? 0
      const cargoCount = (ship.cargo ?? []).reduce((s, c) => s + c.count, 0)
      if (cargoCount > cap) {
        result[dest] = result[dest] ?? []
        result[dest].push({ unit_type: ship.unit_type, excess: cargoCount - cap })
      }
    }
    return result
  }

  function isReadyToConfirm() {
    const excess = excessBySystem()
    const totalExcess = Object.values(excess).flatMap(x => x).reduce((s, e) => s + e.excess, 0)
    const totalRemoved = excessRemovals.reduce((s, r) => s + r.count, 0)
    return totalExcess === totalRemoved
  }

  async function confirmMove(activeSystemKey) {
    return moveShipsFn(gameId, {
      active_system_key: activeSystemKey,
      ships: selectedShips,
      excess_removals: excessRemovals,
    })
  }

  return {
    selectedShips, setSelectedShips,
    excessRemovals, setExcessRemovals,
    reachableSystems, capacityRemaining, excessBySystem, isReadyToConfirm,
    confirmMove,
    reset: () => { setSelectedShips([]); setExcessRemovals([]) },
  }
}
