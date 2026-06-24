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
  drawAgenda: vi.fn(),
  castVotes: vi.fn(),
  resolveAgenda: vi.fn(),
  createTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  rejectTransaction: vi.fn(),
  rescindTransaction: vi.fn(),
  playPromissoryNote: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { playPromissoryNote } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'active',
  phase: 'action',
  round: 1,
  vp_goal: 10,
  speaker_player_id: 'p1',
  active_player_id: 'p1',
}

const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5, action_card_count: 2, secrets_selected: true, tokens_redistributed: true },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', strategy_card: 3, passed: true, vp: 3, action_card_count: 0, secrets_selected: true, tokens_redistributed: true },
]

function mockSupabase({ relicFragments = [] } = {}) {
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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: relicFragments, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

describe('useGame Phase 45 — playTheNote options + myRelicFragments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('playTheNote passes { planet_name } options to playPromissoryNote', async () => {
    playPromissoryNote.mockResolvedValue({ played: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.playTheNote('note-1', { planet_name: 'Mecatol Rex' }))
    expect(playPromissoryNote).toHaveBeenCalledWith('game-uuid', 'note-1', { planet_name: 'Mecatol Rex' })
  })

  it('playTheNote passes { fragment_ids } options to playPromissoryNote', async () => {
    playPromissoryNote.mockResolvedValue({ played: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.playTheNote('note-1', { fragment_ids: ['a', 'b'] }))
    expect(playPromissoryNote).toHaveBeenCalledWith('game-uuid', 'note-1', { fragment_ids: ['a', 'b'] })
  })

  it('myRelicFragments is populated on load when player has held fragments', async () => {
    mockSupabase({
      relicFragments: [
        { id: 'frag-1', exploration_cards: { relic_fragment_type: 'cultural' } },
        { id: 'frag-2', exploration_cards: { relic_fragment_type: 'cultural' } },
      ],
    })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myRelicFragments).toHaveLength(2)
    expect(result.current.myRelicFragments[0].id).toBe('frag-1')
    expect(result.current.myRelicFragments[1].relic_fragment_type).toBe('cultural')
  })

  it('myRelicFragments is [] when current user is not in the players list', async () => {
    // userId 'unknown-uuid' does not match any player — hook calls navigate('/setup') and returns early
    const { result } = renderHook(() => useGame('ABC123', 'unknown-uuid'))
    // myRelicFragments starts as [] and is never set because myPlayer is null (navigate called first)
    expect(result.current.myRelicFragments).toEqual([])
  })
})
