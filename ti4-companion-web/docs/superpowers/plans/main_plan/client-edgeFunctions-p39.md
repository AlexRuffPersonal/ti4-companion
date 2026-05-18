# client-edgeFunctions (Phase 39)

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-start-draft, fn-game-draft-pick-slice, fn-game-draft-place-tile

## Changes

```js
export const startDraft = (gameId, mode) =>
  callFunction('game-start-draft', { game_id: gameId, mode })

export const draftPickSlice = (gameId, sliceId) =>
  callFunction('game-draft-pick-slice', { game_id: gameId, slice_id: sliceId })

export const draftPlaceTile = (gameId, tileNumber, position, rotation = 0) =>
  callFunction('game-draft-place-tile', { game_id: gameId, tile_number: tileNumber, position, rotation })
```

## Tests

```js
// startDraft: calls callFunction('game-start-draft', { game_id, mode })
// draftPickSlice: calls callFunction('game-draft-pick-slice', { game_id, slice_id })
// draftPlaceTile: calls callFunction('game-draft-place-tile', { game_id, tile_number, position, rotation })
// draftPlaceTile default rotation=0 when not provided
```
