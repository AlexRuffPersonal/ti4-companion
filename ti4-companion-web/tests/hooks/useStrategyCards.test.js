import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockPlaysChannel, mockResponsesChannel } = vi.hoisted(() => {
  const makeChan = () => {
    const c = { on: vi.fn(), subscribe: vi.fn() }
    c.on.mockReturnValue(c)
    c.subscribe.mockReturnValue(c)
    return c
  }
  return { mockPlaysChannel: makeChan(), mockResponsesChannel: makeChan() }
})

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  playStrategyCard: vi.fn(),
  useStrategySecondary: vi.fn(),
  passStrategySecondary: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { playStrategyCard, useStrategySecondary, passStrategySecondary } from '../../src/lib/edgeFunctions.js'
import { useStrategyCards } from '../../src/hooks/useStrategyCards.js'

const GAME_ID = 'game-uuid'
const MY_PLAYER_ID = 'player-1'
const PLAY_ID = 'play-uuid'

const ACTIVE_PLAY = {
  id: PLAY_ID,
  game_id: GAME_ID,
  status: 'active',
  card_id: 'leadership',
  player_id: MY_PLAYER_ID,
}

const RESPONSES = [
  { id: 'r1', play_id: PLAY_ID, player_id: MY_PLAYER_ID, status: 'pending', initiative_order: 1 },
  { id: 'r2', play_id: PLAY_ID, player_id: 'player-2', status: 'pending', initiative_order: 2 },
]

function mockFromResponses(rows = RESPONSES) {
  supabase.from.mockImplementation((table) => {
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }
    }
    return { select: vi.fn().mockReturnThis() }
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  mockPlaysChannel.on.mockReturnValue(mockPlaysChannel)
  mockPlaysChannel.subscribe.mockReturnValue(mockPlaysChannel)
  mockResponsesChannel.on.mockReturnValue(mockResponsesChannel)
  mockResponsesChannel.subscribe.mockReturnValue(mockResponsesChannel)

  let callCount = 0
  supabase.channel.mockImplementation(() => {
    callCount++
    return callCount === 1 ? mockPlaysChannel : mockResponsesChannel
  })

  mockFromResponses()
})

describe('useStrategyCards', () => {
  it('subscribes to game_strategy_card_plays on mount', () => {
    renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))
    expect(supabase.channel).toHaveBeenCalledWith('strategy-plays')
    expect(mockPlaysChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'game_strategy_card_plays', filter: `game_id=eq.${GAME_ID}` }),
      expect.any(Function)
    )
    expect(mockPlaysChannel.subscribe).toHaveBeenCalled()
  })

  it('sets activePay when play becomes active', async () => {
    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })

    await waitFor(() => expect(result.current.activePay).toEqual(ACTIVE_PLAY))
  })

  it('clears activePay when play completes', async () => {
    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })
    await waitFor(() => expect(result.current.activePay).not.toBeNull())

    act(() => {
      playsHandler({ new: { ...ACTIVE_PLAY, status: 'complete' } })
    })
    await waitFor(() => expect(result.current.activePay).toBeNull())
  })

  it('subscribes to responses when activePay is set', async () => {
    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })

    await waitFor(() => expect(result.current.activePay).toEqual(ACTIVE_PLAY))
    expect(supabase.channel).toHaveBeenCalledWith('strategy-responses')
    expect(mockResponsesChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'game_strategy_card_responses', filter: `play_id=eq.${PLAY_ID}` }),
      expect.any(Function)
    )
  })

  it('isMyTurnToRespond true when caller is next pending by initiative_order', async () => {
    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })

    // My player has initiative_order 1 (lowest pending) — should be my turn
    await waitFor(() => expect(result.current.isMyTurnToRespond).toBe(true))
  })

  it('isMyTurnToRespond false when another player has lower pending initiative_order', async () => {
    // Responses where another player has lower initiative_order
    const otherFirstResponses = [
      { id: 'r1', play_id: PLAY_ID, player_id: 'player-2', status: 'pending', initiative_order: 1 },
      { id: 'r2', play_id: PLAY_ID, player_id: MY_PLAYER_ID, status: 'pending', initiative_order: 2 },
    ]
    mockFromResponses(otherFirstResponses)

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })

    // Another player has initiative_order 1 — not my turn
    await waitFor(() => expect(result.current.isMyTurnToRespond).toBe(false))
  })

  it('dispatchers call correct edge function wrappers', async () => {
    playStrategyCard.mockResolvedValue({})
    useStrategySecondary.mockResolvedValue({})
    passStrategySecondary.mockResolvedValue({})

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    // Set activePay so secondary dispatchers have a play id
    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => {
      playsHandler({ new: ACTIVE_PLAY })
    })
    await waitFor(() => expect(result.current.activePay).toEqual(ACTIVE_PLAY))

    await act(() => result.current.playPrimary('leadership-ability', { targets: [] }))
    expect(playStrategyCard).toHaveBeenCalledWith(GAME_ID, 'leadership-ability', { targets: [] })

    await act(() => result.current.useSecondary('leadership-secondary', { targets: [] }))
    expect(useStrategySecondary).toHaveBeenCalledWith(GAME_ID, PLAY_ID, 'leadership-secondary', { targets: [] })

    await act(() => result.current.passSecondary())
    expect(passStrategySecondary).toHaveBeenCalledWith(GAME_ID, PLAY_ID)
  })

  it('agendaPeekCards set from playPrimary response when peek_cards present', async () => {
    const peekCards = [{ id: 'a1', name: 'Political Favor', text: 'text' }]
    playStrategyCard.mockResolvedValue({ play_id: 'p1', peek_cards: peekCards })

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    await act(async () => {
      await result.current.playPrimary('politics-ability', {})
    })
    expect(result.current.agendaPeekCards).toEqual(peekCards)
  })

  it('clearAgendaPeekCards resets agendaPeekCards to null', async () => {
    playStrategyCard.mockResolvedValue({ peek_cards: [{ id: 'a1' }] })

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    await act(async () => {
      await result.current.playPrimary('politics-ability', {})
    })
    expect(result.current.agendaPeekCards).not.toBeNull()

    act(() => { result.current.clearAgendaPeekCards() })
    expect(result.current.agendaPeekCards).toBeNull()
  })

  it('warfareHomeSystemKey set from useSecondary response when home_system_key present', async () => {
    useStrategySecondary.mockResolvedValue({ responded: true, home_system_key: '2,3' })

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))

    const playsHandler = mockPlaysChannel.on.mock.calls[0][2]
    act(() => { playsHandler({ new: ACTIVE_PLAY }) })
    await waitFor(() => expect(result.current.activePay).toEqual(ACTIVE_PLAY))

    await act(async () => {
      await result.current.useSecondary('warfare-secondary', {})
    })
    expect(result.current.warfareHomeSystemKey).toBe('2,3')
  })

  it('fetchAgendaTopCards queries game_agenda_deck and returns mapped cards', async () => {
    const agendaRows = [
      { agenda_cards: { id: 'a1', name: 'Political Favor', text: 'text1' } },
      { agenda_cards: { id: 'a2', name: 'Assassinate', text: 'text2' } },
    ]
    supabase.from.mockImplementation((table) => {
      if (table === 'game_agenda_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: agendaRows }),
                }),
              }),
            }),
          }),
        }
      }
      return { select: vi.fn().mockReturnThis() }
    })

    const { result } = renderHook(() => useStrategyCards(GAME_ID, MY_PLAYER_ID))
    let cards
    await act(async () => {
      cards = await result.current.fetchAgendaTopCards()
    })
    expect(cards).toEqual([
      { id: 'a1', name: 'Political Favor', text: 'text1' },
      { id: 'a2', name: 'Assassinate', text: 'text2' },
    ])
  })
})
