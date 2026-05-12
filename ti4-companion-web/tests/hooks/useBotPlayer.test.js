import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/lib/botStrategies/scripted.js', () => ({
  getNextAction: vi.fn(),
}))

vi.mock('../../src/lib/botStrategies/random.js', () => ({
  getNextAction: vi.fn(),
}))

import { useBotPlayer } from '../../src/hooks/useBotPlayer.js'
import { getNextAction as scriptedGetNextAction } from '../../src/lib/botStrategies/scripted.js'
import { getNextAction as randomGetNextAction } from '../../src/lib/botStrategies/random.js'

function makeGame(overrides = {}) {
  return {
    id: 'game-1',
    phase: 'action',
    active_player_id: 'bot-player-id',
    strategy_cards: [],
    ...overrides,
  }
}

function makePlayers(overrides = []) {
  return [
    { id: 'bot-player-id', is_bot: true, bot_strategy: 'scripted', passed: false },
    { id: 'human-player-id', is_bot: false },
    ...overrides,
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('useBotPlayer', () => {
  it('isBotTurn=false when current player is human: effect does not fire', async () => {
    const game = makeGame({ active_player_id: 'human-player-id' })
    const players = makePlayers()
    const edgeFns = {}

    const { result } = renderHook(() =>
      useBotPlayer({ game, players, currentPlayer: null, isHost: true, edgeFns })
    )

    expect(result.current.isBotTurn).toBe(false)

    await act(async () => {
      vi.runAllTimers()
    })

    expect(scriptedGetNextAction).not.toHaveBeenCalled()
    expect(randomGetNextAction).not.toHaveBeenCalled()
  })

  it('isBotTurn=false when caller is not host: effect does not fire', async () => {
    const game = makeGame()
    const players = makePlayers()
    const edgeFns = {}

    const { result } = renderHook(() =>
      useBotPlayer({ game, players, currentPlayer: null, isHost: false, edgeFns })
    )

    expect(result.current.isBotTurn).toBe(false)

    await act(async () => {
      vi.runAllTimers()
    })

    expect(scriptedGetNextAction).not.toHaveBeenCalled()
    expect(randomGetNextAction).not.toHaveBeenCalled()
  })

  it('isBotTurn=true: calls strategy.getNextAction; dispatches returned edge function', async () => {
    const game = makeGame()
    const players = makePlayers()
    const mockEdgeFn = vi.fn().mockResolvedValue({})
    const edgeFns = { 'game-player-pass': mockEdgeFn }

    scriptedGetNextAction.mockReturnValue({ fnName: 'game-player-pass', args: { game_id: 'game-1' } })

    const { result } = renderHook(() =>
      useBotPlayer({ game, players, currentPlayer: null, isHost: true, edgeFns })
    )

    expect(result.current.isBotTurn).toBe(true)

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(scriptedGetNextAction).toHaveBeenCalledWith(game, players, players[0])
    expect(mockEdgeFn).toHaveBeenCalledWith({ game_id: 'game-1' })
  })

  it('isBotTurn=true, getNextAction returns null: isTicking reset, no dispatch', async () => {
    const game = makeGame()
    const players = makePlayers()
    const mockEdgeFn = vi.fn().mockResolvedValue({})
    const edgeFns = { 'game-player-pass': mockEdgeFn }

    scriptedGetNextAction.mockReturnValue(null)

    renderHook(() =>
      useBotPlayer({ game, players, currentPlayer: null, isHost: true, edgeFns })
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(scriptedGetNextAction).toHaveBeenCalled()
    expect(mockEdgeFn).not.toHaveBeenCalled()
  })

  it('does not double-fire if effect re-runs while isTicking=true', async () => {
    const game = makeGame()
    const players = makePlayers()
    const mockEdgeFn = vi.fn().mockResolvedValue({})
    const edgeFns = { 'game-player-pass': mockEdgeFn }

    let resolveFirst
    scriptedGetNextAction.mockReturnValueOnce({ fnName: 'game-player-pass', args: { game_id: 'game-1' } })

    const { rerender } = renderHook(
      ({ g }) => useBotPlayer({ game: g, players, currentPlayer: null, isHost: true, edgeFns }),
      { initialProps: { g: game } }
    )

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    rerender({ g: { ...game, active_player_id: 'bot-player-id' } })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(scriptedGetNextAction).toHaveBeenCalledTimes(1)
  })
})
