import { startDraft, draftPickSlice, draftPlaceTile } from '../lib/edgeFunctions.js'

export function useDraft({ game, currentPlayer }) {
  const draftState = game?.draft_state ?? null
  const gameId = game?.id

  let isMyTurn = false
  if (draftState && currentPlayer) {
    if (draftState.phase === 'slice-pick') {
      isMyTurn = draftState.pick_order?.[draftState.pick_index] === currentPlayer.id
    } else if (draftState.phase === 'placement') {
      isMyTurn = draftState.placement_order?.[draftState.placement_index] === currentPlayer.id
    }
  }

  const myHand = draftState?.hands?.[currentPlayer?.id] ?? []

  return {
    draftState,
    isMyTurn,
    myHand,
    startDraft: (mode) => startDraft(gameId, mode),
    pickSlice: (sliceId) => draftPickSlice(gameId, sliceId),
    placeTile: (tileNumber, position, rotation) => draftPlaceTile(gameId, tileNumber, position, rotation),
  }
}
