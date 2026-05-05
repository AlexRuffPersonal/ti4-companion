import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/lobby/ABC123' }),
}))

// vi.hoisted makes mockChannel accessible inside vi.mock factories AND in test code
const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
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
  updateGameSettings: vi.fn(),
  pickFactionColor: vi.fn(),
  setSpeaker: vi.fn(),
  startGame: vi.fn(),
  endTurn: vi.fn(),
  passAction: vi.fn(),
  advancePhase: vi.fn(),
  scoreObjective: vi.fn(),
  revealObjective: vi.fn(),
  shuffleDeck: vi.fn(),
  updateCommandTokens: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'lobby',
  vp_goal: 10,
  speaker_player_id: null,
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: null, colour: null },
]

function mockSupabaseLoad({ game = GAME, players = PLAYERS, gameError = null, playersError = null } = {}) {
  let callCount = 0
  supabase.from.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // games query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    // game_players query
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
      }),
    }
  })
}

describe('useGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore channel chain behavior after clearAllMocks resets implementations
    mockChannel.on.mockImplementation(() => mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    mockSupabaseLoad()
  })

  it('loads game and players on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.game).toEqual(GAME)
    expect(result.current.players).toHaveLength(2)
  })

  it('sets isHost true for the host user', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isHost).toBe(true)
  })

  it('sets isHost false for a non-host player', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'other-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isHost).toBe(false)
  })

  it('sets currentPlayer to the matching player row', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'other-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.currentPlayer?.display_name).toBe('Bob')
  })

  it('redirects to /setup when user is not in the game', async () => {
    mockSupabaseLoad({ players: [] })
    renderHook(() => useGame('ABC123', 'stranger-uuid'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/setup', { replace: true }))
  })

  it('navigates to /game/:code when game status is already active on load', async () => {
    mockSupabaseLoad({ game: { ...GAME, status: 'active' } })
    renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/ABC123', { replace: true }))
  })

  it('navigates to /game/:code when Realtime fires status=active', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Find the callback registered for the games table
    const gamesCall = mockChannel.on.mock.calls.find(([, filter]) => filter?.table === 'games')
    const gamesCallback = gamesCall?.[2]
    expect(gamesCallback).toBeDefined()

    act(() => {
      gamesCallback({ new: { ...GAME, status: 'active' } })
    })

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/game/ABC123', { replace: true })
    )
  })

  it('sets an error when game is not found', async () => {
    mockSupabaseLoad({ game: null })
    const { result } = renderHook(() => useGame('XXXXXX', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/not found/i)
  })

  it('isEliminated is true when currentPlayer.eliminated is true', async () => {
    const players = [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null, eliminated: true },
      { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: null, colour: null },
    ]
    mockSupabaseLoad({ players })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isEliminated).toBe(true)
  })

  it('isEliminated is false when currentPlayer.eliminated is false', async () => {
    const players = [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null, eliminated: false },
      { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: null, colour: null },
    ]
    mockSupabaseLoad({ players })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isEliminated).toBe(false)
  })

  it('isEliminated is false when currentPlayer is null', async () => {
    mockSupabaseLoad({ players: [] })
    const { result } = renderHook(() => useGame('ABC123', 'stranger-uuid'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
    expect(result.current.isEliminated).toBe(false)
  })
})
