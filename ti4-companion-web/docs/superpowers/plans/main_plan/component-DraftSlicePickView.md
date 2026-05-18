# component-DraftSlicePickView

**File:** `src/components/game/DraftSlicePickView.jsx`
**Status:** New
**Prereqs:** component-DraftTileHand

## Functionality

```jsx
// Props: { draftState, tileByNumber, currentPlayer, onPickSlice, pickError }
// Shows status bar: "Milty Draft — Slice Pick", whose turn indicator.
// Grid of N slice cards. Each card shows:
//   - Slice N · Score X.X
//   - Tile chips (tile_number, R/I or anomaly/wormhole labels)
//   - "Pick this slice" button (only on unclaimed slices when isMyTurn)
//   - "Claimed" label on claimed slices (greyed, opacity-50)
// pickError shown as text-danger below grid.
// Non-active pickers see grid read-only (no Pick buttons).
```

## Tests

```jsx
// renders one card per slice
// shows score for each slice
// claimed slice has opacity class; shows "Claimed" text
// active picker: unclaimed slices show Pick button
// non-active picker: no Pick buttons anywhere
// clicking Pick calls onPickSlice(slice.id)
// pickError rendered when set
```
