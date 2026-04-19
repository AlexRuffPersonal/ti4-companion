import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()
let mockPathname = '/game/ABC123'

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
}))

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
  drawActionCard: vi.fn(),
  discardActionCard: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { endTurn, passAction } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'active',
  phase: 'action',
  round: 2,
  vp_goal: 10,
  speaker_player_id: 'p1',
  active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5 },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', strategy_card: 3, passed: false, vp: 3 },
]
const OBJECTIVES = [
  { id: 'go1', objective_id: 'ref-obj-1', state: 'revealed', deck_position: 0, scored_by: ['p1'],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 } },
]
const PLANETS = [
  { id: 'pl1', game_id: 'game-uuid', player_id: 'p1', planet_name: 'Mecatol Rex', exhausted: false },
]

function mockGameScreenLoad() {
  let callCount = 0
  supabase.from.mockImplementation(() => {
    callCount++
    if (callCount === 1) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: GAME, error: null }),
        }),
      }),
    }
    if (callCount === 2) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }),
      }),
    }
    if (callCount === 3) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: OBJECTIVES, error: null }),
      }),
    }
    if (callCount === 4) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: PLANETS, error: null }),
      }),
    }
    if (callCount === 5) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
    // game_player_secret_objectives
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }
  })
}

describe('useGame (game screen path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/game/ABC123'
    mockChannel.on.mockImplementation(() => mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    mockGameScreenLoad()
  })

  it('does NOT navigate away when on /game/ route with active game', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('loads objectives and planets on game screen', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.objectives).toHaveLength(1)
    expect(result.current.planets).toHaveLength(1)
  })

  it('exposes endTurn wrapper that calls endTurn edge function', async () => {
    endTurn.mockResolvedValue({ advanced: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.endTheTurn() })
    expect(endTurn).toHaveBeenCalledWith('game-uuid')
  })

  it('exposes passAction wrapper that calls passAction edge function', async () => {
    passAction.mockResolvedValue({ passed: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.passTheAction() })
    expect(passAction).toHaveBeenCalledWith('game-uuid')
  })
})
