import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  startDraft: vi.fn().mockResolvedValue({}),
  draftPickSlice: vi.fn().mockResolvedValue({}),
  draftPlaceTile: vi.fn().mockResolvedValue({}),
}))

import { startDraft, draftPickSlice, draftPlaceTile } from '../../src/lib/edgeFunctions.js'
import { useDraft } from '../../src/hooks/useDraft.js'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OTHER_ID = 'other-uuid'

const CURRENT_PLAYER = { id: PLAYER_ID }

function makeGame(draftState) {
  return { id: GAME_ID, draft_state: draftState }
}

describe('useDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draftState is null when game.draft_state is null', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.draftState).toBeNull()
  })

  it('isMyTurn is false when draftState is null', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.isMyTurn).toBe(false)
  })

  it('isMyTurn is true when phase=slice-pick and currentPlayer is active picker', () => {
    const draftState = { phase: 'slice-pick', pick_order: [PLAYER_ID, OTHER_ID], pick_index: 0, hands: {} }
    const { result } = renderHook(() => useDraft({ game: makeGame(draftState), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.isMyTurn).toBe(true)
  })

  it('isMyTurn is false when phase=slice-pick and not active picker', () => {
    const draftState = { phase: 'slice-pick', pick_order: [OTHER_ID, PLAYER_ID], pick_index: 0, hands: {} }
    const { result } = renderHook(() => useDraft({ game: makeGame(draftState), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.isMyTurn).toBe(false)
  })

  it('isMyTurn is true when phase=placement and currentPlayer is active placer', () => {
    const draftState = { phase: 'placement', placement_order: [PLAYER_ID, OTHER_ID], placement_index: 0, hands: {} }
    const { result } = renderHook(() => useDraft({ game: makeGame(draftState), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.isMyTurn).toBe(true)
  })

  it('myHand returns correct array from hands[currentPlayer.id]', () => {
    const hand = [{ tileNumber: 1 }, { tileNumber: 2 }]
    const draftState = { phase: 'slice-pick', pick_order: [], pick_index: 0, hands: { [PLAYER_ID]: hand } }
    const { result } = renderHook(() => useDraft({ game: makeGame(draftState), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.myHand).toEqual(hand)
  })

  it('myHand is [] when currentPlayer.id not in hands', () => {
    const draftState = { phase: 'slice-pick', pick_order: [], pick_index: 0, hands: {} }
    const { result } = renderHook(() => useDraft({ game: makeGame(draftState), currentPlayer: CURRENT_PLAYER }))
    expect(result.current.myHand).toEqual([])
  })

  it('startDraft calls startDraft(gameId, mode)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: CURRENT_PLAYER }))
    await act(async () => { await result.current.startDraft('warp') })
    expect(startDraft).toHaveBeenCalledWith(GAME_ID, 'warp')
  })

  it('pickSlice calls draftPickSlice(gameId, sliceId)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: CURRENT_PLAYER }))
    await act(async () => { await result.current.pickSlice('slice-3') })
    expect(draftPickSlice).toHaveBeenCalledWith(GAME_ID, 'slice-3')
  })

  it('placeTile calls draftPlaceTile(gameId, tileNumber, position, rotation)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: CURRENT_PLAYER }))
    await act(async () => { await result.current.placeTile(42, '0,1', 2) })
    expect(draftPlaceTile).toHaveBeenCalledWith(GAME_ID, 42, '0,1', 2)
  })
})
