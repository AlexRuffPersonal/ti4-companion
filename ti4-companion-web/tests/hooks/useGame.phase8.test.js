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
import {
  createTransaction,
  confirmTransaction,
  rejectTransaction,
  rescindTransaction,
  playPromissoryNote,
} from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'active',
  phase: 'strategy',
  round: 1,
  vp_goal: 10,
  speaker_player_id: 'p1',
  active_player_id: 'p1',
}

const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5, action_card_count: 2, secrets_selected: true, tokens_redistributed: true },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', strategy_card: 3, passed: true, vp: 3, action_card_count: 0, secrets_selected: true, tokens_redistributed: true },
]

const MY_NOTES = [
  {
    id: 'note-1',
    state: 'held',
    held_by_player_id: 'p1',
    note_id: 'pn1',
    promissory_notes: { name: 'Political Secret', text: 'Example text', into_play_area: false },
    origin_player_id: 'p2',
  },
]

const PENDING_TRADES = [
  {
    id: 'tx-1',
    game_id: 'game-uuid',
    from_player_id: 'p2',
    to_player_id: 'p1',
    status: 'pending',
    offer: { commodities: 2 },
    request: { trade_goods: 3 },
  },
  {
    id: 'tx-2',
    game_id: 'game-uuid',
    from_player_id: 'p2',
    to_player_id: 'p1',
    status: 'pending',
    offer: { promissory_note_ids: ['pn1'] },
    request: { trade_goods: 1 },
  },
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
            eq: vi.fn().mockResolvedValue({ data: MY_NOTES, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_transactions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: PENDING_TRADES, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

describe('useGame Phase 8 — promissory notes & transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('loads myNotes for the current player on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myNotes).toHaveLength(1)
    expect(result.current.myNotes[0].id).toBe('note-1')
    expect(result.current.myNotes[0].promissory_notes.name).toBe('Political Secret')
  })

  it('loads pendingIncomingTrades filtered to current player as recipient', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pendingIncomingTrades).toHaveLength(2)
    expect(result.current.pendingIncomingTrades.every(tx => tx.to_player_id === 'p1')).toBe(true)
    expect(result.current.pendingIncomingTrades[0].id).toBe('tx-1')
  })

  it('createTheTransaction calls createTransaction with game code, to_player_id, offer, request', async () => {
    createTransaction.mockResolvedValue({ id: 'tx-new' })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.createTheTransaction('p2', { commodities: 1 }, { trade_goods: 2 }))
    expect(createTransaction).toHaveBeenCalledWith('game-uuid', 'p2', { commodities: 1 }, { trade_goods: 2 })
  })

  it('confirmTheTransaction calls confirmTransaction with game code and transaction id', async () => {
    confirmTransaction.mockResolvedValue({ confirmed: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.confirmTheTransaction('tx-1'))
    expect(confirmTransaction).toHaveBeenCalledWith('game-uuid', 'tx-1')
  })

  it('rejectTheTransaction calls rejectTransaction with game code and transaction id', async () => {
    rejectTransaction.mockResolvedValue({ rejected: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.rejectTheTransaction('tx-1'))
    expect(rejectTransaction).toHaveBeenCalledWith('game-uuid', 'tx-1')
  })

  it('rescindTheTransaction calls rescindTransaction with game code and transaction id', async () => {
    rescindTransaction.mockResolvedValue({ rescinded: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.rescindTheTransaction('tx-1'))
    expect(rescindTransaction).toHaveBeenCalledWith('game-uuid', 'tx-1')
  })

  it('playTheNote calls playPromissoryNote with game code and note instance id', async () => {
    playPromissoryNote.mockResolvedValue({ played: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.playTheNote('note-1'))
    expect(playPromissoryNote).toHaveBeenCalledWith('game-uuid', 'note-1')
  })

  it('has myNotes and pendingIncomingTrades in return object', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toHaveProperty('myNotes')
    expect(result.current).toHaveProperty('pendingIncomingTrades')
    expect(result.current).toHaveProperty('createTheTransaction')
    expect(result.current).toHaveProperty('confirmTheTransaction')
    expect(result.current).toHaveProperty('rejectTheTransaction')
    expect(result.current).toHaveProperty('rescindTheTransaction')
    expect(result.current).toHaveProperty('playTheNote')
  })
})
