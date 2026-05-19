# client-edgeFunctions-exploration-fixes
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-use-enigmatic-device

## Functionality
Add one new export:

```js
export const useEnigmaticDevice = (gameId, playerId, cardId, resourcePlanetNames, technologyName) =>
  callFunction('game-use-enigmatic-device', {
    game_id: gameId,
    player_id: playerId,
    card_id: cardId,
    resource_planet_names: resourcePlanetNames,
    technology_name: technologyName,
  })
```

## Tests
No standalone test file — covered by hook and component integration tests.
