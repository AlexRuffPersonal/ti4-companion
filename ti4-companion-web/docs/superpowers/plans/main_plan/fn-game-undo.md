# fn-game-undo

**File:** `supabase/functions/game-undo/index.ts`
**Status:** New
**Prereqs:** shared-gameEvents, shared-undoHandlers, shared-auth-p33

## Functionality

```pseudocode
CORS AUTH BODY(game_id) PLAYER GAME(host_player_id, round, phase)

ERR('Not host', 403) if player.id !== game.host_player_id

events = await getUndoableEvents(db, game_id, 1)
ERR('Nothing to undo', 409) if events.length === 0

event = events[0]

await applyUndoHandler(db, event)
await applyUndo(db, event.id)

// Fetch updated game state to return
updatedGame = SELECT games WHERE id = game_id
updatedPlayers = SELECT game_players WHERE game_id = game_id

OK({ game: updatedGame, players: updatedPlayers, undone_event_type: event.event_type })
```

## Tests

New file: `tests/functions/game-undo.test.js`

```pseudocode
STD_MOCKS REQ(game_id) TCORS
T401 T400(game_id) T404_PLAYER T404_GAME

T403('not host') — caller is not host_player_id
T409('nothing to undo') — getUndoableEvents returns []

GIVEN host with one undoable EVT_SCORE_OBJECTIVE event:
  EXPECT applyUndoHandler called with that event
  EXPECT applyUndo called with event.id
  EXPECT OK({ game, players, undone_event_type: 'score_objective' })
```
