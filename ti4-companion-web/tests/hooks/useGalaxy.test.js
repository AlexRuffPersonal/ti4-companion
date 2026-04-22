import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  mockChannel.on.mockReturnValue(mockChannel)
  return { mockChannel }
})

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { activateSystem, landTroops } from '../../src/lib/edgeFunctions.js'
import { useGalaxy } from '../../src/hooks/useGalaxy.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  round: 2,
  map_tiles: {
    '0,0': { tile_id: 'tile-mecatol', tile_number: '18' },
    '1,-1': { tile_id: 'tile-32', tile_number: '32' },
  },
}

const TILES = [
  { id: 'tile-mecatol', tile_number: '18', planets: [{ name: 'Mecatol Rex' }], type: 'blue', wormhole: null },
  { id: 'tile-32', tile_number: '32', planets: [{ name: 'Wellon' }], type: 'blue', wormhole: null },
]

const ACTIVATIONS = [
  { id: 'act-1', player_id: 'p1', system_key: '1,-1', round: 2 },
]

const PLANETS = [
  { id: 'pl-1', player_id: 'p1', planet_name: 'Wellon', exhausted: false },
]

const UNITS = [
  { id: 'u-1', player_id: 'p1', system_key: '1,-1', unit_type: 'infantry', count: 1, on_planet: 'Wellon' },
]

function mockSupabase() {
  supabase.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: GAME, error: null }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: TILES, error: null }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: ACTIVATIONS, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: PLANETS, error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: UNITS, error: null }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
  mockSupabase()
})

describe('useGalaxy', () => {
  it('fetches game, tile data, activations, planets, and units on mount', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.mapTiles).toEqual(GAME.map_tiles)
    expect(result.current.tileData['tile-mecatol']).toBeDefined()
    expect(result.current.activations).toHaveLength(1)
    expect(result.current.allPlanets).toHaveLength(1)
    expect(result.current.systemUnits).toHaveLength(1)
  })

  it('computes activatedSystems set', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activatedSystems.has('1,-1')).toBe(true)
    expect(result.current.activatedSystems.has('0,0')).toBe(false)
  })

  it('computes myActivations set for the current player', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myActivations.has('1,-1')).toBe(true)
  })

  it('computes planetOwnership map', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.planetOwnership.get('Wellon')).toEqual({ player_id: 'p1', exhausted: false })
  })

  it('activateSystem wrapper calls edgeFunctions.activateSystem with bound gameId', async () => {
    activateSystem.mockResolvedValue({ activated: true })
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.activateSystem('1,-1'))
    expect(activateSystem).toHaveBeenCalledWith('game-uuid', '1,-1')
  })

  it('landTroops wrapper calls edgeFunctions.landTroops with bound gameId', async () => {
    landTroops.mockResolvedValue({ claimed: true })
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.landTroops('1,-1', 'Wellon', 1))
    expect(landTroops).toHaveBeenCalledWith('game-uuid', '1,-1', 'Wellon', 1)
  })

  it('subscribes to realtime channels on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})