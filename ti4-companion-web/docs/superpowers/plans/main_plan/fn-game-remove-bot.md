# fn-game-remove-bot

**File:** `supabase/functions/game-remove-bot/index.ts`
**Status:** New
**Prereqs:** migration-044-bot-players, shared-auth-p33, shared-gameEvents

## Functionality

```pseudocode
CORS AUTH BODY(game_id, bot_player_id) PLAYER GAME(status, host_player_id)

ERR('Game already started', 409) if game.status !== 'lobby'
ERR('Not host', 403) if player.id !== game.host_player_id

botRow = SELECT FROM game_players WHERE id=bot_player_id AND game_id=game_id
ERR('Bot not found', 404) if !botRow
ERR('Not a bot', 409) if !botRow.is_bot

DELETE FROM game_players WHERE id = bot_player_id

await logEvent(db, { game_id, player_id: player.id, event_type: EVT_REMOVE_BOT,
  payload: { bot_player_id, faction: botRow.faction }, round: 0, phase: 'lobby' })

OK({ removed: bot_player_id })
```

## Tests

New file: `tests/functions/game-remove-bot.test.js`

```pseudocode
STD_MOCKS REQ(game_id, bot_player_id) TCORS
T401 T400(game_id) T400(bot_player_id) T404_PLAYER T404_GAME

T409('game already started') — game.status = 'in_progress'
T403('not host') — caller is not host_player_id
T404('bot not found') — no game_players row for bot_player_id
T409('not a bot') — game_players row exists but is_bot=false

GIVEN valid host request in lobby:
  EXPECT DELETE from game_players for bot_player_id
  EXPECT logEvent called with EVT_REMOVE_BOT
  EXPECT OK({ removed: bot_player_id })
```
