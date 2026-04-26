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
import { useGalaxy } from '../../src/hooks/useGalaxy.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', round: 1,
  map_tiles: { '1,-1': { tile_id: 'tile-a' } },
}

const COMBAT = {
  id: 'combat-uuid', game_id: 'game-uuid', system_key: '1,-1',
  attacker_player_id: 'p1', defender_player_id: 'p2',
  phase: 'attacker_roll', round: 1, status: 'active',
  attacker_hits: 0, defender_hits: 0,
}

function mockSupabase(activeCombat = COMBAT) {
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
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
              maybeSingle: vi.fn().mockResolvedValue({ data: activeCombat, error: null }),
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

describe('useGalaxy — activeCombat (Phase 10)', () => {
  it('exposes activeCombat after load when a combat is active', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).not.toBeNull()
    expect(result.current.activeCombat.phase).toBe('attacker_roll')
  })

  it('exposes activeCombat as null when no active combat', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).toBeNull()
  })

  it('updates activeCombat on Realtime INSERT for game_combats', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Find the game_combats channel handler
    const combatCall = mockChannel.on.mock.calls.find((c) => c[1]?.table === 'game_combats')
    const combatHandler = combatCall?.[2]

    act(() => {
      combatHandler({ eventType: 'INSERT', new: COMBAT })
    })

    expect(result.current.activeCombat).toEqual(COMBAT)
  })

  it('clears activeCombat when combat status becomes complete', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).not.toBeNull()

    const combatCall = mockChannel.on.mock.calls.find((c) => c[1]?.table === 'game_combats')
    const combatHandler = combatCall?.[2]

    act(() => {
      combatHandler({ eventType: 'UPDATE', new: { ...COMBAT, status: 'complete' } })
    })

    expect(result.current.activeCombat).toBeNull()
  })
})