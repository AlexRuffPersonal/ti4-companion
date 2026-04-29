# client-edgeFunctions-p30

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-exhaust-technology, fn-game-ready-technology, fn-game-use-technology-action

## Changes

```pseudocode
// Client Wrapper Pattern:
export const exhaustTechnology = (gameId, technologyName) =>
  callFunction('game-exhaust-technology', { game_id: gameId, technology_name: technologyName })

export const readyTechnology = (gameId, technologyName) =>
  callFunction('game-ready-technology', { game_id: gameId, technology_name: technologyName })

export const useTechnologyAction = (gameId, technologyName, selections) =>
  callFunction('game-use-technology-action', { game_id: gameId, technology_name: technologyName, selections })
```

## Tests

```pseudocode
exhaustTechnology: calls callFunction with 'game-exhaust-technology' and correct body
readyTechnology: calls callFunction with 'game-ready-technology' and correct body
useTechnologyAction: calls callFunction with 'game-use-technology-action' and correct body
```
