# hook-useGame-p26
**File:** `src/hooks/useGame.js`
**Status:** Modify
**Prereqs:** migration-039-elimination

## Changes

```pseudocode
// In the return value, derive and expose:
isEliminated: currentPlayer?.eliminated ?? false

// No other changes — eliminated field is already present on game_players rows
// returned by the existing Realtime subscription.
```

## Tests

```pseudocode
it('isEliminated is true when currentPlayer.eliminated is true')
it('isEliminated is false when currentPlayer.eliminated is false')
it('isEliminated is false when currentPlayer is null')
```
