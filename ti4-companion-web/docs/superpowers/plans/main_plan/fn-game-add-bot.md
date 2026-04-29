# fn-game-add-bot

**File:** `supabase/functions/game-add-bot/index.ts`
**Status:** New
**Prereqs:** migration-044-bot-players, shared-auth-p33, shared-gameEvents

## Functionality

```pseudocode
CORS AUTH BODY(game_id, display_name, faction, color, bot_strategy) PLAYER GAME(phase, host_player_id, status)

ERR('Game already started', 409) if game.status !== 'lobby'
ERR('Not host', 403) if player.id !== game.host_player_id
ERR('Invalid bot_strategy', 400) if bot_strategy not in ['random', 'scripted']

ERR('Faction taken', 409) if game_players has row with game_id + faction
ERR('Color taken', 409) if game_players has row with game_id + color

seat_index = COUNT(game_players WHERE game_id) + 1

INSERT INTO game_players (game_id, user_id, display_name, faction, color, bot_strategy, is_bot, seat_index)
VALUES (game_id, null, display_name, faction, color, bot_strategy, true, seat_index)

await logEvent(db, { game_id, player_id: player.id, event_type: EVT_ADD_BOT,
  payload: { display_name, faction, color, bot_strategy }, round: 0, phase: 'lobby' })

OK({ id: newRow.id, display_name, faction, color, bot_strategy, is_bot: true })
```

## Tests

New file: `tests/functions/game-add-bot.test.js`

```pseudocode
STD_MOCKS REQ(game_id, display_name, faction, color, bot_strategy) TCORS
T401 T400(game_id) T400(display_name) T400(faction) T400(color) T400(bot_strategy)
T404_PLAYER T404_GAME

T409('game already started') — game.status = 'in_progress'
T403('not host') — caller is not host_player_id
T400('invalid bot_strategy') — bot_strategy = 'cheating'
T409('faction taken') — another player has same faction
T409('color taken') — another player has same color

GIVEN valid request as host in lobby:
  EXPECT INSERT into game_players with is_bot=true, user_id=null
  EXPECT logEvent called with EVT_ADD_BOT
  EXPECT OK({ id, display_name, faction, color, bot_strategy, is_bot: true })
```
