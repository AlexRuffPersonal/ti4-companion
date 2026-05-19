# client-edgeFunctions-p43c
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-unlock-commander, fn-game-resolve-commander-reroll

## Changes
```pseudocode
// Add new wrappers:
export const unlockCommander = (gameId, leaderId) =>
  callFunction('game-unlock-commander', { game_id: gameId, leader_id: leaderId })

export const resolveCommanderReroll = (gameId, combatId, rerollIndices) =>
  callFunction('game-resolve-commander-reroll', { game_id: gameId, combat_id: combatId, reroll_indices: rerollIndices })
```

## Tests
```pseudocode
// Extend existing edgeFunctions test file:
it('unlockCommander calls game-unlock-commander with correct body')
it('resolveCommanderReroll calls game-resolve-commander-reroll with correct body')
```
