# component-GameScreen-p26
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useGame-p26

## Changes

```pseudocode
// Destructure from useGame:
const { ..., isEliminated } = useGame(code)

// Add eliminated banner at top of return, before all panels:
{isEliminated && (
  <div className="bg-danger/20 border border-danger/40 text-danger px-4 py-2 text-sm font-body">
    You have been eliminated. You are spectating the remainder of the game.
  </div>
)}

// Wrap all action-triggering panels in elimination gate:
{!isEliminated && (
  <>
    {/* strategy card panel, end-turn button, combat action triggers, etc. */}
  </>
)}
// Read-only panels (galaxy map, score, player list) remain unconditional.

// In player list rendering, for each player:
// Apply visual dim when player.eliminated is true:
<span className={player.eliminated ? 'text-muted line-through' : ''}>
  {player.display_name}
</span>
```

## Tests

```pseudocode
it('renders eliminated banner when isEliminated is true')
it('does not render eliminated banner when isEliminated is false')
it('action panels absent when isEliminated is true')
it('galaxy map renders regardless of isEliminated')
it('eliminated player name shown with line-through in player list')
it('non-eliminated player name shown without line-through')
```
