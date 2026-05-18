# hook-useDraft

**File:** `src/hooks/useDraft.js`
**Status:** New
**Prereqs:** client-edgeFunctions-p39

## Functionality

```js
// useDraft({ game, currentPlayer })
// Reads game.draft_state (already subscribed via useGame Realtime)
// Returns derived state + action wrappers

export function useDraft({ game, currentPlayer }) {
  draftState = game?.draft_state ?? null
  gameId = game?.id

  isMyTurn:
    if phase==='slice-pick': pick_order[pick_index] === currentPlayer.id
    if phase==='placement': placement_order[placement_index] === currentPlayer.id
    else false

  myHand: draftState?.hands?.[currentPlayer?.id] ?? []

  return {
    draftState,
    isMyTurn,
    myHand,
    startDraft: (mode) => startDraft(gameId, mode),
    pickSlice: (sliceId) => draftPickSlice(gameId, sliceId),
    placeTile: (tileNumber, position, rotation) => draftPlaceTile(gameId, tileNumber, position, rotation),
  }
}
```

## Tests

```js
// draftState=null when game.draft_state is null
// isMyTurn=false when draftState is null
// isMyTurn=true when phase=slice-pick and currentPlayer.id === pick_order[pick_index]
// isMyTurn=false when phase=slice-pick and not active picker
// isMyTurn=true when phase=placement and currentPlayer.id === placement_order[placement_index]
// myHand returns correct array from hands[currentPlayer.id]
// myHand=[] when currentPlayer.id not in hands
// startDraft calls startDraft(gameId, mode)
// pickSlice calls draftPickSlice(gameId, sliceId)
// placeTile calls draftPlaceTile(gameId, tileNumber, position, rotation)
```
