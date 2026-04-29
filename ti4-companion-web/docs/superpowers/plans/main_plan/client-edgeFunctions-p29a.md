# client-edgeFunctions-p29a
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-play-action-card-p29a, fn-game-pass-action-window-p29b

## Changes

```js
// Add exports:
export const playActionCard = (gameId, cardId, selections) =>
  callFunction('game-play-action-card', { game_id: gameId, card_id: cardId, selections })

export const passActionWindow = (gameId) =>
  callFunction('game-pass-action-window', { game_id: gameId })
```

## Tests

```pseudocode
it('playActionCard calls game-play-action-card with game_id, card_id, selections')
it('passActionWindow calls game-pass-action-window with game_id')
```
