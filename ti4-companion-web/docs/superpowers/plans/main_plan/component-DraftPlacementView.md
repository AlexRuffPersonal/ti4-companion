# component-DraftPlacementView

**File:** `src/components/game/DraftPlacementView.jsx`
**Status:** New
**Prereqs:** component-DraftTileHand

## Functionality

```jsx
// Props: { draftState, tileByNumber, tileDataById, currentPlayer, players, game,
//          onPlaceTile, placeError }
// Local state: selectedTile string|null
//
// Status bar: "Placement Phase — Turn N of M" + active player name + next player name
//
// Layout: flex row
//   Left: HexMap (reused) with:
//     mapTiles = { '0,0': mecatol, ...placed_tiles mapped to {tile_number, tile_id, rotation} }
//     onSelectSystem = handleHexClick (only fires when isMyTurn && selectedTile !== null)
//   Right panel (w-48):
//     Turn order: next 6 entries from placement_order[placement_index:+6]
//     Ring progress: count placed tiles per ring (ring1:6,ring2:12,ring3:12 for 6P)
//
// Bottom: DraftTileHand (currentPlayer's hand; active when isMyTurn)
// Hint text when tile selected: "click a valid hex to place it"
// placeError shown as text-danger
//
// handleHexClick(systemKey): if isMyTurn && selectedTile, call onPlaceTile(selectedTile, systemKey, 0); clear selectedTile
```

## Tests

```jsx
// renders status bar with active player name
// HexMap receives correct mapTiles (includes Mecatol + placed tiles)
// DraftTileHand rendered with currentPlayer's hand
// clicking tile in hand sets selectedTile (hint text appears)
// clicking same tile again deselects
// handleHexClick fires onPlaceTile when tile selected and isMyTurn
// handleHexClick does nothing when no tile selected
// placeError shown when set
// non-active player: hand disabled; onPlaceTile not called
```
