# hook-useMovement
**File:** `src/hooks/useMovement.js`
**Status:** New
**Prereqs:** fn-game-move-ships, client-edgeFunctions

## Functionality

```js
export function useMovement(gameId, game, tileData, mapTiles, allSpaceUnits, myPlayerId, myTokenSystems) {
  // selectedShips: [{ unit_type, origin_system_key, path[], cargo[] }]
  const [selectedShips, setSelectedShips] = useState([])

  // Path helpers (pure, no state)
  function axialNeighbors(systemKey) { /* q,r ± standard axial offsets */ }
  function wormholeNeighbors(systemKey) { /* systems sharing a wormhole type */ }
  function isAdjacent(a, b) { return axialNeighbors(a).includes(b) || wormholeNeighbors(a).includes(b) }

  function tileAnomaly(systemKey) { return tileData[mapTiles[systemKey]?.tile_id]?.anomalies ?? [] }
  function isBlocked(systemKey) { /* asteroid_field or supernova in anomalies */ }
  function isNebula(systemKey) { return tileAnomaly(systemKey).includes('nebula') }
  function isGravityRift(systemKey) { return tileAnomaly(systemKey).includes('gravity_rift') }

  function effectiveMoveValue(ship) {
    const def = /* look up unit move from tileData/unitDefs */ ship.moveValue
    return isNebula(ship.origin_system_key) ? 1 : def
  }

  function gravityBonus(path) {
    // +1 for each gravity rift in transit hops (not including origin, not including destination if not transit)
    return path.slice(0, -1).filter(sk => isGravityRift(sk)).length
  }

  // reachableSystems(ship, currentPath): next legal hops from currentPath's last system
  function reachableSystems(ship, currentPath) {
    const last = currentPath[currentPath.length - 1]
    const stepsUsed = currentPath.length - 1
    const maxSteps = effectiveMoveValue(ship) + gravityBonus(currentPath)
    if (stepsUsed >= maxSteps) return []
    const enemySystems = new Set(allSpaceUnits
      .filter(u => u.player_id !== myPlayerId)
      .map(u => u.system_key))
    return [last, ...axialNeighbors(last), ...wormholeNeighbors(last)]
      .filter(sk => isAdjacent(last, sk))
      .filter(sk => !isBlocked(sk))
      .filter(sk => !(isNebula(sk) && stepsUsed + 1 < maxSteps)) // nebula only as final
      .filter(sk => !enemySystems.has(sk) || sk === last) // can't transit enemy
  }

  function capacityRemaining(ship) {
    const def = /* unitDef for ship.unit_type */ ship.capacity
    return def - ship.cargo.reduce((s, c) => s + c.count, 0)
  }

  // excessBySystem(): { [system_key]: [{ unit_type, excess }] } after applying selectedShips
  function excessBySystem() { /* compute per-system capacity after ships move */ }

  // excess_removals state
  const [excessRemovals, setExcessRemovals] = useState([])

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
```

## Tests

```
reachableSystems: carrier at "0,1" with move=2, no blockers → returns adjacent systems within 2 hops
reachableSystems: asteroid field in path → excluded
reachableSystems: enemy-occupied transit system → excluded
reachableSystems: nebula → only returned when it would be the final hop
reachableSystems: gravity rift in path → +1 to effective range on next call
capacityRemaining: carrier capacity=4, cargo=[{count:2},{count:1}] → returns 1
excessBySystem: 2 fighters left in origin after carrier departs (origin capacity now 0) → returns excess=2
excessBySystem: active system receives 3 units but ships there have capacity=4 → no excess
isReadyToConfirm: excessBySystem total matches excessRemovals total → true
isReadyToConfirm: removals don't cover excess → false
confirmMove: calls moveShips with correct payload
```
