import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameEvents } from '../../src/hooks/useGameEvents.js'

const BASE_GAME = { id: 'g1', phase: 'action' }

describe('useGameEvents', () => {
  it('emits ACTION_PHASE_START when game.phase is action on mount', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    expect(result.current.currentEvent).toMatchObject({ type: 'ACTION_PHASE_START', gameId: 'g1' })
  })

  it('emits AGENDA_PHASE_START when game.phase changes to agenda', () => {
    const { result, rerender } = renderHook(({ game }) => useGameEvents(game, [], null), {
      initialProps: { game: BASE_GAME },
    })
    rerender({ game: { id: 'g1', phase: 'agenda' } })
    expect(result.current.currentEvent).toMatchObject({ type: 'AGENDA_PHASE_START', gameId: 'g1' })
  })

  it('does not re-emit if phase does not change', () => {
    const { result, rerender } = renderHook(({ game }) => useGameEvents(game, [], null), {
      initialProps: { game: BASE_GAME },
    })
    const first = result.current.currentEvent
    rerender({ game: { id: 'g1', phase: 'action', round: 2 } })
    expect(result.current.currentEvent).toBe(first)
  })

  it('emitEvent sets currentEvent with the given type and gameId', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    act(() => {
      result.current.emitEvent('SPACE_COMBAT_START', { triggeredByPlayerId: 'p1' })
    })
    expect(result.current.currentEvent).toMatchObject({
      type: 'SPACE_COMBAT_START',
      gameId: 'g1',
      triggeredByPlayerId: 'p1',
    })
  })

  it('clearEvent sets currentEvent to null', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    act(() => { result.current.clearEvent() })
    expect(result.current.currentEvent).toBeNull()
  })

  it('returns null event when game is null', () => {
    const { result } = renderHook(() => useGameEvents(null, [], null))
    expect(result.current.currentEvent).toBeNull()
  })
})
