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
  exhaustLegendaryCard: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { exhaustLegendaryCard } from '../../src/lib/edgeFunctions.js'
import { useLegendaryCards } from '../../src/hooks/useLegendaryCards.js'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OTHER_PLAYER_ID = 'other-uuid'

const CARD_1 = { id: 'card-1', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex', exhausted: false }
const CARD_2 = { id: 'card-2', game_id: GAME_ID, player_id: OTHER_PLAYER_ID, planet_name: 'Ixth', exhausted: false }

function mockSupabase(cards = [CARD_1, CARD_2]) {
  supabase.from.mockImplementation((table) => {
    if (table === 'game_player_legendary_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: cards, error: null }),
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

describe('useLegendaryCards', () => {
  it('fetches and returns myCards filtered by playerId', async () => {
    const { result } = renderHook(() => useLegendaryCards(GAME_ID, PLAYER_ID))
    await waitFor(() => expect(result.current.allCards).toHaveLength(2))
    expect(result.current.myCards).toHaveLength(1)
    expect(result.current.myCards[0].id).toBe('card-1')
  })

  it('updates allCards on INSERT Realtime event', async () => {
    const { result } = renderHook(() => useLegendaryCards(GAME_ID, PLAYER_ID))
    await waitFor(() => expect(result.current.allCards).toHaveLength(2))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    const newCard = { id: 'card-3', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Primor', exhausted: false }
    act(() => {
      realtimeHandler({ eventType: 'INSERT', new: newCard })
    })

    expect(result.current.allCards).toHaveLength(3)
    expect(result.current.allCards.find((c) => c.id === 'card-3')).toBeDefined()
  })

  it('updates status on UPDATE Realtime event', async () => {
    const { result } = renderHook(() => useLegendaryCards(GAME_ID, PLAYER_ID))
    await waitFor(() => expect(result.current.allCards).toHaveLength(2))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ eventType: 'UPDATE', new: { ...CARD_1, exhausted: true } })
    })

    expect(result.current.allCards.find((c) => c.id === 'card-1').exhausted).toBe(true)
  })

  it('removes card on DELETE Realtime event', async () => {
    const { result } = renderHook(() => useLegendaryCards(GAME_ID, PLAYER_ID))
    await waitFor(() => expect(result.current.allCards).toHaveLength(2))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ eventType: 'DELETE', old: { id: 'card-2' } })
    })

    expect(result.current.allCards).toHaveLength(1)
    expect(result.current.allCards.find((c) => c.id === 'card-2')).toBeUndefined()
  })

  it('exhaustCard calls exhaustLegendaryCard with correct args', async () => {
    exhaustLegendaryCard.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useLegendaryCards(GAME_ID, PLAYER_ID))
    await waitFor(() => expect(result.current.allCards).toHaveLength(2))

    await act(() => result.current.exhaustCard('Mecatol Rex'))
    expect(exhaustLegendaryCard).toHaveBeenCalledWith(GAME_ID, 'Mecatol Rex')
  })
})
