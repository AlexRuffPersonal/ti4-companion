import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  mockChannel.on.mockReturnValue(mockChannel)
  return { mockChannel }
})

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  rollRiftDice: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { rollRiftDice } from '../../src/lib/edgeFunctions.js'
import { useRiftTransit } from '../../src/hooks/useRiftTransit.js'

const GAME_ID = 'game-uuid'

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
})

describe('useRiftTransit', () => {
  it('returns activeTransit=null initially', () => {
    const { result } = renderHook(() => useRiftTransit(GAME_ID))
    expect(result.current.activeTransit).toBeNull()
  })

  it('returns loading=false and error=null initially', () => {
    const { result } = renderHook(() => useRiftTransit(GAME_ID))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('INSERT/UPDATE event with status="pending" → activeTransit set to payload.new', () => {
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    const transitRow = { id: 'transit-1', game_id: GAME_ID, status: 'pending' }
    act(() => {
      realtimeHandler({ new: transitRow })
    })

    expect(result.current.activeTransit).toEqual(transitRow)
  })

  it('event with status="complete" → activeTransit set to null', () => {
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    // First set a transit
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'pending' } })
    })
    expect(result.current.activeTransit).not.toBeNull()

    // Then complete it
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'complete' } })
    })
    expect(result.current.activeTransit).toBeNull()
  })

  it('rollAll: calls rollRiftDice(transitId, true, undefined)', async () => {
    rollRiftDice.mockResolvedValue({ rolls: [4, 5] })
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    // Set an active transit
    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'pending' } })
    })

    await act(async () => {
      await result.current.rollAll()
    })

    expect(rollRiftDice).toHaveBeenCalledWith('transit-1', true, undefined)
  })

  it('rollOne: calls rollRiftDice(transitId, false, unitId)', async () => {
    rollRiftDice.mockResolvedValue({ rolls: [3] })
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'pending' } })
    })

    await act(async () => {
      await result.current.rollOne('unit-1')
    })

    expect(rollRiftDice).toHaveBeenCalledWith('transit-1', false, 'unit-1')
  })

  it('loading is true during async call and false after resolve', async () => {
    let resolveRoll
    rollRiftDice.mockReturnValue(new Promise(res => { resolveRoll = res }))
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'pending' } })
    })

    // Start the roll without awaiting
    act(() => {
      result.current.rollAll()
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveRoll({ rolls: [4] })
    })
    expect(result.current.loading).toBe(false)
  })

  it('error set when rollRiftDice rejects', async () => {
    rollRiftDice.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useRiftTransit(GAME_ID))

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ new: { id: 'transit-1', game_id: GAME_ID, status: 'pending' } })
    })

    await act(async () => {
      await result.current.rollAll()
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.loading).toBe(false)
  })

  it('channel removed on unmount (removeChannel called)', async () => {
    const { unmount } = renderHook(() => useRiftTransit(GAME_ID))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })

  it('subscribes to channel with correct filter', () => {
    renderHook(() => useRiftTransit(GAME_ID))
    expect(supabase.channel).toHaveBeenCalledWith(`rift_transit_${GAME_ID}`)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'game_rift_transits',
        filter: `game_id=eq.${GAME_ID}`,
      }),
      expect.any(Function)
    )
  })
})
