# client-edgeFunctions-p42
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions, fn-game-use-relic-p42

## Functionality
```pseudocode
// Update useRelic signature:
export const useRelic = (gameId, playerId, relicId, opts = {}) =>
  callFunction('game-use-relic', {
    game_id: gameId, player_id: playerId, relic_id: relicId,
    choice: opts.choice,
    use_type: opts.useType,
    planet_name: opts.planetName,
    deck_type: opts.deckType,
    card_ids: opts.cardIds,
    technology_name: opts.technologyName,
  })
```

## Tests
No standalone test — covered via RelicPanel component tests.
