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
  callFunction: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { callFunction } from '../../src/lib/edgeFunctions.js'
import { usePromissoryNotes } from '../../src/hooks/usePromissoryNotes.js'

const GAME_ID = 'game-uuid'
const MY_PLAYER_ID = 'player-1'
const OTHER_PLAYER_ID = 'player-2'

const NOTE_HELD_MINE = {
  id: 'note-inst-1',
  game_id: GAME_ID,
  note_id: 'pn-1',
  owner_player_id: OTHER_PLAYER_ID,
  held_by_player_id: MY_PLAYER_ID,
  state: 'held',
  promissory_notes: { name: 'Political Favor', flavor_text: 'Some flavor' },
}

const NOTE_HELD_OTHER = {
  id: 'note-inst-2',
  game_id: GAME_ID,
  note_id: 'pn-2',
  owner_player_id: MY_PLAYER_ID,
  held_by_player_id: OTHER_PLAYER_ID,
  state: 'held',
  promissory_notes: { name: 'Shard of the Throne', flavor_text: 'Other flavor' },
}

const NOTE_IN_PLAY_MINE = {
  id: 'note-inst-3',
  game_id: GAME_ID,
  note_id: 'pn-3',
  owner_player_id: MY_PLAYER_ID,
  held_by_player_id: null,
  state: 'in_play',
  promissory_notes: { name: 'Trade Convoys', flavor_text: 'In play flavor' },
}

const NOTE_IN_PLAY_OTHER = {
  id: 'note-inst-4',
  game_id: GAME_ID,
  note_id: 'pn-4',
  owner_player_id: OTHER_PLAYER_ID,
  held_by_player_id: null,
  state: 'in_play',
  promissory_notes: { name: 'Ceasefire', flavor_text: 'Ceasefire flavor' },
}

function mockSupabaseFrom(rows) {
  supabase.from.mockImplementation((table) => {
    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
  mockSupabaseFrom([NOTE_HELD_MINE, NOTE_HELD_OTHER, NOTE_IN_PLAY_MINE, NOTE_IN_PLAY_OTHER])
})

describe('usePromissoryNotes', () => {
  it('heldNotes only includes notes where held_by=myPlayerId AND state=held', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.heldNotes).toHaveLength(1)
    expect(result.current.heldNotes[0].id).toBe('note-inst-1')
  })

  it('inPlayNotes includes all players in_play notes', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.inPlayNotes).toHaveLength(2)
    expect(result.current.inPlayNotes.map(n => n.id)).toEqual(
      expect.arrayContaining(['note-inst-3', 'note-inst-4'])
    )
  })

  it('playNote calls callFunction with correct args', async () => {
    callFunction.mockResolvedValue({ success: true })
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.playNote('note-inst-1', { target_player_id: OTHER_PLAYER_ID }))

    expect(callFunction).toHaveBeenCalledWith('game-play-promissory-note', {
      game_id: GAME_ID,
      note_instance_id: 'note-inst-1',
      selections: { target_player_id: OTHER_PLAYER_ID },
    })
  })

  it('playNote uses empty selections by default', async () => {
    callFunction.mockResolvedValue({ success: true })
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.playNote('note-inst-1'))

    expect(callFunction).toHaveBeenCalledWith('game-play-promissory-note', {
      game_id: GAME_ID,
      note_instance_id: 'note-inst-1',
      selections: {},
    })
  })

  it('Realtime INSERT/UPDATE event triggers re-fetch', async () => {
    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const initialCallCount = supabase.from.mock.calls.length

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ eventType: 'INSERT' })
    })

    await waitFor(() => expect(supabase.from.mock.calls.length).toBeGreaterThan(initialCallCount))
  })

  it('sets error when fetch fails', async () => {
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    }))

    const { result } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.heldNotes).toHaveLength(0)
    expect(result.current.inPlayNotes).toHaveLength(0)
  })

  it('subscribes to Realtime on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => usePromissoryNotes(GAME_ID, MY_PLAYER_ID))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith(`promissory-notes:${GAME_ID}`))
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})
