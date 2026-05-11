import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  moveShips: vi.fn(),
}))

import { moveShips } from '../../src/lib/edgeFunctions.js'
import { useMovement } from '../../src/hooks/useMovement.js'

const GAME_ID = 'game-uuid'
const MY_PLAYER_ID = 'p1'

// Build a simple flat map: "0,1" is origin, neighbors at axial distance 1
const MAP_TILES = {
  '0,0': { tile_id: 'tile-a' },
  '0,1': { tile_id: 'tile-b' },
  '1,0': { tile_id: 'tile-c' },
  '1,1': { tile_id: 'tile-d' },
  '-1,1': { tile_id: 'tile-e' },
  '0,2': { tile_id: 'tile-f' },
  '1,-1': { tile_id: 'tile-g' },
}

const TILE_DATA = {
  'tile-a': { tile_number: '18', wormholes: [], anomalies: [], planets: [] },
  'tile-b': { tile_number: '32', wormholes: [], anomalies: [], planets: [] },
  'tile-c': { tile_number: '33', wormholes: [], anomalies: [], planets: [] },
  'tile-d': { tile_number: '34', wormholes: [], anomalies: [], planets: [] },
  'tile-e': { tile_number: '35', wormholes: [], anomalies: [], planets: [] },
  'tile-f': { tile_number: '36', wormholes: [], anomalies: [], planets: [] },
  'tile-g': { tile_number: '37', wormholes: [], anomalies: [], planets: [] },
}

function makeHook(overrides = {}) {
  const {
    tileData = TILE_DATA,
    mapTiles = MAP_TILES,
    allSpaceUnits = [],
    myPlayerId = MY_PLAYER_ID,
  } = overrides
  return renderHook(() =>
    useMovement(GAME_ID, {}, tileData, mapTiles, allSpaceUnits, myPlayerId, [])
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMovement – reachableSystems', () => {
  it('carrier at "0,1" with move=2, no blockers → returns adjacent systems within 2 hops', () => {
    const { result } = makeHook()
    const ship = { origin_system_key: '0,1', moveValue: 2, player_id: MY_PLAYER_ID }
    // From "0,1" after 0 steps, neighbors within 1 are the axial neighbors
    const reachable = result.current.reachableSystems(ship, ['0,1'])
    // Axial neighbors of "0,1": "1,1", "-1,1", "1,0", "-1,1", "0,2", "0,0"  -- recalculate:
    // q=0, r=1 → neighbors: (1,1),(−1,1),(0,2),(0,0),(1,0),(−1,2)
    expect(reachable).toContain('0,0')
    expect(reachable).toContain('1,0')
    expect(reachable).toContain('0,2')
    expect(reachable).toContain('1,1')
    expect(reachable).toContain('-1,1')
    // All are within mapTiles and no blockers
    expect(reachable.length).toBeGreaterThan(0)
  })

  it('asteroid field in a neighbor → that system excluded', () => {
    const tileData = {
      ...TILE_DATA,
      'tile-a': { ...TILE_DATA['tile-a'], anomalies: ['asteroid_field'] },
    }
    const { result } = makeHook({ tileData })
    const ship = { origin_system_key: '0,1', moveValue: 2, player_id: MY_PLAYER_ID }
    const reachable = result.current.reachableSystems(ship, ['0,1'])
    // "0,0" maps to tile-a which is blocked
    expect(reachable).not.toContain('0,0')
  })

  it('supernova in a neighbor → that system excluded', () => {
    const tileData = {
      ...TILE_DATA,
      'tile-c': { ...TILE_DATA['tile-c'], anomalies: ['supernova'] },
    }
    const { result } = makeHook({ tileData })
    const ship = { origin_system_key: '0,1', moveValue: 2, player_id: MY_PLAYER_ID }
    const reachable = result.current.reachableSystems(ship, ['0,1'])
    // "1,0" maps to tile-c which is blocked
    expect(reachable).not.toContain('1,0')
  })

  it('enemy-occupied system → excluded', () => {
    const allSpaceUnits = [
      { player_id: 'p2', system_key: '0,0' },
    ]
    const { result } = makeHook({ allSpaceUnits })
    const ship = { origin_system_key: '0,1', moveValue: 2, player_id: MY_PLAYER_ID }
    const reachable = result.current.reachableSystems(ship, ['0,1'])
    expect(reachable).not.toContain('0,0')
  })

  it('nebula neighbor → only returned when it would be the final hop', () => {
    // "0,0" = nebula. With move=2, stepping into nebula at step 1 is NOT final (1 < 2), so excluded.
    const tileData = {
      ...TILE_DATA,
      'tile-a': { ...TILE_DATA['tile-a'], anomalies: ['nebula'] },
    }
    const { result } = makeHook({ tileData })
    const ship = { origin_system_key: '0,1', moveValue: 2, player_id: MY_PLAYER_ID }
    // step 0 → 1, stepsUsed=0, maxSteps=2, stepsUsed+1=1 < 2 → nebula excluded
    const reachableStep1 = result.current.reachableSystems(ship, ['0,1'])
    expect(reachableStep1).not.toContain('0,0')

    // Now at step 1 from "1,0", stepsUsed=1, maxSteps=2, stepsUsed+1=2 === 2 → nebula allowed
    const reachableStep2 = result.current.reachableSystems(ship, ['0,1', '1,0'])
    // "0,0" is adjacent to "1,0"? q=1,r=0 → neighbors: (2,0),(0,0),(1,1),(1,-1),(2,-1),(0,1)
    // Yes, "0,0" is a neighbor of "1,0"
    expect(reachableStep2).toContain('0,0')
  })

  it('gravity rift in current path → +1 to effective range', () => {
    // "0,0" is gravity rift. Path includes it. Bonus = 1.
    const tileData = {
      ...TILE_DATA,
      'tile-a': { ...TILE_DATA['tile-a'], anomalies: ['gravity_rift'] },
    }
    const { result } = makeHook({ tileData })
    const ship = { origin_system_key: '0,1', moveValue: 1, player_id: MY_PLAYER_ID }
    // Without rift, move=1, so only 1 step. Path ['0,1', '0,0'] → stepsUsed=1 >= maxSteps(1), but
    // gravityBonus counts rifts in path.slice(0,-1) = ['0,1'] → '0,1' anomalies=[] → 0 bonus
    // Actually let's check with origin being the rift:
    // If path is ['0,1', '0,0'] and tile-a (rift) is at '0,0':
    // path.slice(0,-1) = ['0,1'], '0,1' → tile-b, no anomaly → bonus=0
    // So we need the rift to be IN the traversed path (not destination)
    // Let's set '0,1' (tile-b) to rift instead:
    const tileDataWithRiftAtOrigin = {
      ...TILE_DATA,
      'tile-b': { ...TILE_DATA['tile-b'], anomalies: ['gravity_rift'] },
    }
    const { result: result2 } = makeHook({ tileData: tileDataWithRiftAtOrigin })
    const ship2 = { origin_system_key: '0,1', moveValue: 1, player_id: MY_PLAYER_ID }
    // Path ['0,1'], stepsUsed=0, maxSteps = 1 + 0 = 1
    // gravityBonus(['0,1']): path.slice(0,-1)=[] → 0
    // Hmm, that also gives 0. The rift bonus applies when moving THROUGH a rift, not starting there.
    // Let's use a 2-step path where the middle step is a rift:
    const ship3 = { origin_system_key: '0,1', moveValue: 1, player_id: MY_PLAYER_ID }
    // path ['0,1', '1,0'] → gravityBonus: path.slice(0,-1)=['0,1'], tile-b has rift → bonus=1
    // stepsUsed=1, maxSteps=1+1=2
    const reachable = result2.current.reachableSystems(ship3, ['0,1', '1,0'])
    expect(reachable.length).toBeGreaterThan(0)
  })

  it('max steps reached → returns empty array', () => {
    const { result } = makeHook()
    const ship = { origin_system_key: '0,1', moveValue: 1, player_id: MY_PLAYER_ID }
    // path length 2 = stepsUsed 1 = maxSteps 1 → no more moves
    const reachable = result.current.reachableSystems(ship, ['0,1', '0,0'])
    expect(reachable).toEqual([])
  })
})

describe('useMovement – capacityRemaining', () => {
  it('capacity=4, cargo=[{count:2},{count:1}] → returns 1', () => {
    const { result } = makeHook()
    const ship = { capacity: 4, cargo: [{ count: 2 }, { count: 1 }] }
    expect(result.current.capacityRemaining(ship)).toBe(1)
  })

  it('no cargo → returns full capacity', () => {
    const { result } = makeHook()
    const ship = { capacity: 3, cargo: [] }
    expect(result.current.capacityRemaining(ship)).toBe(3)
  })

  it('undefined cargo → returns full capacity', () => {
    const { result } = makeHook()
    const ship = { capacity: 2 }
    expect(result.current.capacityRemaining(ship)).toBe(2)
  })
})

describe('useMovement – isReadyToConfirm', () => {
  it('no selectedShips → no excess → true (0===0)', () => {
    const { result } = makeHook()
    expect(result.current.isReadyToConfirm()).toBe(true)
  })

  it('excess=2, removals cover it → true', () => {
    const { result } = makeHook()
    act(() => {
      // A ship with path that has excess cargo
      result.current.setSelectedShips([
        { path: ['0,1', '0,0'], capacity: 1, cargo: [{ count: 3 }], unit_type: 'carrier' },
      ])
      result.current.setExcessRemovals([{ count: 2 }])
    })
    expect(result.current.isReadyToConfirm()).toBe(true)
  })

  it('excess=2, removals=1 → false', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setSelectedShips([
        { path: ['0,1', '0,0'], capacity: 1, cargo: [{ count: 3 }], unit_type: 'carrier' },
      ])
      result.current.setExcessRemovals([{ count: 1 }])
    })
    expect(result.current.isReadyToConfirm()).toBe(false)
  })
})

describe('useMovement – confirmMove', () => {
  it('calls moveShipsFn with correct payload', async () => {
    moveShips.mockResolvedValue({ ok: true })
    const { result } = makeHook()
    act(() => {
      result.current.setSelectedShips([{ unit_type: 'carrier', path: ['0,1', '0,0'] }])
    })
    await act(async () => {
      await result.current.confirmMove('0,0')
    })
    expect(moveShips).toHaveBeenCalledWith(GAME_ID, {
      active_system_key: '0,0',
      ships: [{ unit_type: 'carrier', path: ['0,1', '0,0'] }],
      excess_removals: [],
    })
  })
})

describe('useMovement – reset', () => {
  it('clears selectedShips and excessRemovals', () => {
    const { result } = makeHook()
    act(() => {
      result.current.setSelectedShips([{ unit_type: 'cruiser' }])
      result.current.setExcessRemovals([{ count: 1 }])
    })
    expect(result.current.selectedShips).toHaveLength(1)
    act(() => {
      result.current.reset()
    })
    expect(result.current.selectedShips).toHaveLength(0)
    expect(result.current.excessRemovals).toHaveLength(0)
  })
})
