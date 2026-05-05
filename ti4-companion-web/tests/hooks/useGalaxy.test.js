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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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

  describe('planetStaticMap', () => {
    it('maps planet name to resources, influence, tech_specialty, and traits from tileData', async () => {
      const tiles = [
        {
          id: 'tile-welfor',
          tile_number: '42',
          planets: [{ name: 'Welfor', resources: 2, influence: 0, tech_specialty: 'blue', type: ['cultural'] }],
          type: 'blue',
          wormholes: null,
          anomalies: null,
        },
      ]
      supabase.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'g1', code: 'XYZ', round: 1, map_tiles: { '2,0': { tile_id: 'tile-welfor', tile_number: '42' } } },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'tiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
            }),
          }
        }
        if (table === 'game_system_activations') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        }
        if (table === 'game_player_planets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_player_units') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_players') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
        if (table === 'game_combats') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
      })

      const { result } = renderHook(() => useGalaxy('XYZ', 'user-uuid'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.planetStaticMap['Welfor']).toEqual({
        resources: 2,
        influence: 0,
        tech_specialty: 'blue',
        traits: ['cultural'],
      })
    })

    it('sets tech_specialty to null when the planet has no tech_specialty field', async () => {
      const tiles = [
        {
          id: 'tile-bare',
          tile_number: '50',
          planets: [{ name: 'Bare', resources: 1, influence: 1, type: ['hazardous'] }],
          type: 'red',
          wormholes: null,
          anomalies: null,
        },
      ]
      supabase.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'g2', code: 'XYZ', round: 1, map_tiles: { '3,0': { tile_id: 'tile-bare', tile_number: '50' } } },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'tiles') {
          return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: tiles, error: null }) }) }
        }
        if (table === 'game_system_activations') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        }
        if (table === 'game_player_planets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_player_units') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_players') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
        if (table === 'game_combats') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
      })

      const { result } = renderHook(() => useGalaxy('XYZ', 'user-uuid'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.planetStaticMap['Bare'].tech_specialty).toBeNull()
    })

    it('sets traits to [] when the planet has no type field', async () => {
      const tiles = [
        {
          id: 'tile-notype',
          tile_number: '51',
          planets: [{ name: 'NoType', resources: 0, influence: 2 }],
          type: 'blue',
          wormholes: null,
          anomalies: null,
        },
      ]
      supabase.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'g3', code: 'XYZ', round: 1, map_tiles: { '4,0': { tile_id: 'tile-notype', tile_number: '51' } } },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'tiles') {
          return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: tiles, error: null }) }) }
        }
        if (table === 'game_system_activations') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        }
        if (table === 'game_player_planets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_player_units') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_players') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
        if (table === 'game_combats') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
      })

      const { result } = renderHook(() => useGalaxy('XYZ', 'user-uuid'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.planetStaticMap['NoType'].traits).toEqual([])
    })

    it('returns empty planetStaticMap when tileData is empty', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'g4', code: 'XYZ', round: 1, map_tiles: {} },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'game_system_activations') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        }
        if (table === 'game_player_planets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_player_units') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
        }
        if (table === 'game_players') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
        if (table === 'game_combats') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
        }
      })

      const { result } = renderHook(() => useGalaxy('XYZ', 'user-uuid'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.planetStaticMap).toEqual({})
    })
  })
})