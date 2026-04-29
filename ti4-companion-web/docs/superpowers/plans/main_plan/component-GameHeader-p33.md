# component-GameHeader-p33

**File:** `src/components/game/GameHeader.jsx`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p33

## Functionality

```pseudocode
// Add to GameHeader props: { isHost, onUndo, canUndo }

// Render in header controls area (host only):
if isHost:
  <button
    className="btn-ghost text-xs"
    onClick={onUndo}
    disabled={!canUndo}
    title="Undo last action"
  >
    Undo
  </button>

// canUndo is true when the game has at least one undoable event.
// Parent (GameScreen) passes canUndo derived from game state or a separate query.
// No other changes to GameHeader.
```

## Tests

```pseudocode
Undo button renders only when isHost=true
Undo button disabled when canUndo=false
Undo button enabled and calls onUndo when canUndo=true
Undo button absent for non-host
```
