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
  explorePlanet: vi.fn(),
  resolveExplorationCard: vi.fn(),
  exploreFrontier: vi.fn(),
  useRelicFragment: vi.fn(),
  useRelic: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { explorePlanet, resolveExplorationCard, exploreFrontier, useRelicFragment, useRelic } from '../../src/lib/edgeFunctions.js'
import { useExploration } from '../../src/hooks/useExploration.js'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

const currentPlayer = { id: PLAYER_ID }

const PLANET_ROWS = [
  { id: 'pp1', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Jord', explored: false },
  { id: 'pp2', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex', explored: false },
  { id: 'pp3', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Primor', explored: true },
  { id: 'pp4', game_id: GAME_ID, player_id: 'other-player', planet_name: 'Valk', explored: false },
]

const RELIC_FRAGMENT_ROWS = [
  { id: 'rf1', game_id: GAME_ID, resolved_by_player_id: PLAYER_ID, state: 'held', deck_type: 'cultural' },
]

const RELIC_ROWS = [
  { id: 'rd1', game_id: GAME_ID, held_by_player_id: PLAYER_ID, relic_id: 'r1', relics: { id: 'r1', name: 'Shard of the Throne' } },
]

function mockSupabase({ planets = PLANET_ROWS, fragments = RELIC_FRAGMENT_ROWS, relicDeck = RELIC_ROWS } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: planets, error: null }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: fragments, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_relic_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: relicDeck, error: null }),
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

describe('useExploration', () => {
  it('returns empty state when currentPlayer is null', () => {
    const { result } = renderHook(() =>
      useExploration({ currentPlayer: null, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    expect(result.current.unexploredPlanets).toEqual([])
    expect(result.current.relicFragments).toEqual([])
    expect(result.current.relics).toEqual([])
    expect(result.current.allPlanetState).toEqual([])
    expect(result.current.isActivePlayer).toBe(false)
    expect(result.current.explorePlanet).toBeNull()
    expect(result.current.resolveExplorationCard).toBeNull()
    expect(result.current.exploreFrontier).toBeNull()
    expect(result.current.useRelicFragment).toBeNull()
    expect(result.current.useRelic).toBeNull()
  })

  it('returns empty unexploredPlanets when all planets explored', async () => {
    const exploredPlanets = PLANET_ROWS.map((p) => ({ ...p, explored: true }))
    mockSupabase({ planets: exploredPlanets })

    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    await waitFor(() => expect(result.current.allPlanetState.length).toBeGreaterThan(0))
    expect(result.current.unexploredPlanets).toEqual([])
  })

  it('filters out Mecatol Rex from unexploredPlanets', async () => {
    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    await waitFor(() => expect(result.current.allPlanetState.length).toBeGreaterThan(0))
    const names = result.current.unexploredPlanets.map((p) => p.planet_name)
    expect(names).not.toContain('Mecatol Rex')
    expect(names).toContain('Jord')
  })

  it('returns relic fragments for current player', async () => {
    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    await waitFor(() => expect(result.current.relicFragments.length).toBeGreaterThan(0))
    expect(result.current.relicFragments[0].deck_type).toBe('cultural')
  })

  it('returns relics with metadata for current player', async () => {
    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    await waitFor(() => expect(result.current.relics.length).toBeGreaterThan(0))
    expect(result.current.relics[0].relics.name).toBe('Shard of the Throne')
  })

  it('exposes explorePlanet dispatcher', async () => {
    explorePlanet.mockResolvedValue({ ok: true })
    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: null })
    )
    await waitFor(() => expect(result.current.allPlanetState.length).toBeGreaterThan(0))
    await act(() => result.current.explorePlanet('Jord', 'cultural'))
    expect(explorePlanet).toHaveBeenCalledWith(GAME_ID, PLAYER_ID, 'Jord', 'cultural')
  })

  it('isActivePlayer true when activePlayerId matches currentPlayer.id', async () => {
    const { result } = renderHook(() =>
      useExploration({ currentPlayer, gameId: GAME_ID, allPlanets: [], activePlayerId: PLAYER_ID })
    )
    await waitFor(() => expect(result.current.allPlanetState.length).toBeGreaterThan(0))
    expect(result.current.isActivePlayer).toBe(true)
  })
})
