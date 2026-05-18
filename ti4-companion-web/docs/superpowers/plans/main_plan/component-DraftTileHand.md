# component-DraftTileHand

**File:** `src/components/game/DraftTileHand.jsx`
**Status:** New
**Prereqs:** hook-useDraft

## Functionality

```jsx
// Props: { tiles: string[], tileByNumber: Record<string,TileRef>, isMyTurn: boolean,
//          selectedTile: string|null, onSelect: (tileNumber:string)=>void }
// Renders a horizontal scrolling strip of tile chips.
// Each chip shows: tile_number (large), total R/I or anomaly label, wormhole indicator.
// Selected tile gets border-plasma + bg-hull ring.
// Chips are disabled (opacity-50, pointer-events-none) when !isMyTurn.
// Empty hand shows "Hand empty" placeholder.
```

## Tests

```jsx
// renders each tile number
// shows R/I totals for planet tiles
// shows anomaly label for anomaly tiles
// shows wormhole indicator when tile.wormhole set
// chip disabled when isMyTurn=false
// clicking chip when isMyTurn=true calls onSelect(tileNumber)
// selected tile has different visual class than unselected
// empty tiles array renders placeholder text
```
