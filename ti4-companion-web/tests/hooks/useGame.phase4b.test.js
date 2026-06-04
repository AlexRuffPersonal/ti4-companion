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
}))

import { supabase } from '../../src/lib/supabase.js'
import { drawActionCard, discardActionCard } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
  status: 'active', phase: 'action', round: 1, vp_goal: 10,
  speaker_player_id: 'p1', active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5, action_card_count: 2 },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob',   strategy_card: 3, passed: false, vp: 3, action_card_count: 0 },
]
const MY_CARDS = [
  { id: 'deck-1', state: 'held', held_by_player_id: 'p1', action_cards: { name: 'Hack Election', timing: 'Action', text: 'Change the vote.' } },
  { id: 'deck-2', state: 'held', held_by_player_id: 'p1', action_cards: { name: 'Spy', timing: 'Action', text: 'Steal a card.' } },
]

function mockSupabase({ myCards = MY_CARDS } = {}) {
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
            eq: vi.fn().mockResolvedValue({ data: myCards, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_secret_objectives') {
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
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
  })
}

describe('useGame Phase 4b — action cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('loads myCards for the current player on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myCards).toHaveLength(2)
    expect(result.current.myCards[0].id).toBe('deck-1')
  })

  it('drawTheActionCard calls drawActionCard with the game id', async () => {
    drawActionCard.mockResolvedValue({ drawn: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.drawTheActionCard())
    expect(drawActionCard).toHaveBeenCalledWith('game-uuid')
  })

  it('discardTheActionCard calls discardActionCard with game id and card id', async () => {
    discardActionCard.mockResolvedValue({ discarded: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.discardTheActionCard('deck-1'))
    expect(discardActionCard).toHaveBeenCalledWith('game-uuid', 'deck-1')
  })
})
