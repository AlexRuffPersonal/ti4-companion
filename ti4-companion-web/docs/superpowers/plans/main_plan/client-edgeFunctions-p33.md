# client-edgeFunctions-p33

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-add-bot, fn-game-remove-bot, fn-game-undo

## Functionality

Add three new wrapper exports:

```pseudocode
export const addBot = (gameId, displayName, faction, color, botStrategy) =>
  callFunction('game-add-bot', { game_id: gameId, display_name: displayName, faction, color, bot_strategy: botStrategy })

export const removeBot = (gameId, botPlayerId) =>
  callFunction('game-remove-bot', { game_id: gameId, bot_player_id: botPlayerId })

export const undoLastAction = (gameId) =>
  callFunction('game-undo', { game_id: gameId })
```

No changes to existing exports.

## Tests

```pseudocode
addBot: calls callFunction with 'game-add-bot' and correct body
removeBot: calls callFunction with 'game-remove-bot' and correct body
undoLastAction: calls callFunction with 'game-undo' and correct body
```
