# component-GameScreen-p33

**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useBotPlayer, component-GameHeader-p33, client-edgeFunctions-p33

## Functionality

```pseudocode
// 1. Mount useBotPlayer
const { isBotTurn } = useBotPlayer({
  game, players, currentPlayer, isHost,
  edgeFns: { 'game-end-turn': endTurn, 'game-activate-system': activateSystem, /* etc */ }
})

// 2. Track whether there are undoable events (simple client-side heuristic:
//    true once any action has been taken in the current game)
//    Full implementation: query game_events count WHERE game_id + undone_at IS NULL > 0
canUndo = isHost AND game.phase !== 'lobby'

// 3. Undo handler
async function handleUndo()
  await undoLastAction(game.id)

// 4. Bot turn indicator
if isBotTurn:
  render "Bot is thinking..." badge on active player slot

// 5. Pass updated props to GameHeader
<GameHeader ... isHost={isHost} onUndo={handleUndo} canUndo={canUndo} />
```

## Tests

```pseudocode
useBotPlayer mounted on render
isBotTurn=true: "Bot is thinking..." badge visible on active player slot
isBotTurn=false: badge absent
handleUndo calls undoLastAction with game.id
canUndo=false when phase==='lobby'
canUndo=true when host and game in progress
```
