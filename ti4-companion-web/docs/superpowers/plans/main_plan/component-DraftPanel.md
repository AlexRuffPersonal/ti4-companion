# component-DraftPanel

**File:** `src/components/game/DraftPanel.jsx`
**Status:** New
**Prereqs:** component-DraftSlicePickView, component-DraftPlacementView

## Functionality

```jsx
// Props: { draftState, tileByNumber, tileDataById, currentPlayer, players, game,
//          onPickSlice, onPlaceTile }
// Local state: pickError string|null, placeError string|null
//
// Routes based on draftState.phase:
//   'slice-pick' → <DraftSlicePickView .../>
//   'placement'  → <DraftPlacementView .../>
//   otherwise    → null
//
// async handlePickSlice(sliceId): clear pickError, call onPickSlice, catch→setPickError
// async handlePlaceTile(tileNumber, position, rotation): clear placeError, call onPlaceTile, catch→setPlaceError
```

## Tests

```jsx
// renders DraftSlicePickView when phase='slice-pick'
// renders DraftPlacementView when phase='placement'
// renders nothing when phase='complete'
// pickError propagated to DraftSlicePickView after failed pick
// placeError propagated to DraftPlacementView after failed place
```
