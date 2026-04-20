import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/game/ABC123' }),
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
  researchTechnology: vi.fn(),
  discardSecretObjective: vi.fn(),
  scoreSecretObjective: vi.fn(),
  statusPhase: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { discardSecretObjective, scoreSecretObjective, statusPhase } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
  status: 'active', phase: 'status', round: 2, vp_goal: 10,
  speaker_player_id: 'p1', active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: true, vp: 5, action_card_count: 2, secrets_selected: true, tokens_redistributed: false },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob',   strategy_card: 3, passed: true, vp: 3, action_card_count: 0, secrets_selected: false, tokens_redistributed: true },
]
const MY_SECRETS = [
  { id: 's1', state: 'held', player_id: 'p1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex' } },
]

function mockSupabase({ mySecrets = MY_SECRETS } = {}) {
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
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }),
        }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mySecrets, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_laws') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_transactions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    }
  })
}

describe('useGame Phase 6 — secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('loads mySecrets for the current player on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mySecrets).toHaveLength(1)
    expect(result.current.mySecrets[0].id).toBe('s1')
  })

  it('discardTheSecret calls discardSecretObjective with game id and objective id', async () => {
    discardSecretObjective.mockResolvedValue({ discarded: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.discardTheSecret('s1'))
    expect(discardSecretObjective).toHaveBeenCalledWith('game-uuid', 's1')
  })

  it('scoreTheSecret calls scoreSecretObjective with game id and objective id', async () => {
    scoreSecretObjective.mockResolvedValue({ scored: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.scoreTheSecret('s1'))
    expect(scoreSecretObjective).toHaveBeenCalledWith('game-uuid', 's1')
  })

  it('endStatusPhase calls statusPhase with the game id', async () => {
    statusPhase.mockResolvedValue({ advanced: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.endStatusPhase())
    expect(statusPhase).toHaveBeenCalledWith('game-uuid')
  })
})