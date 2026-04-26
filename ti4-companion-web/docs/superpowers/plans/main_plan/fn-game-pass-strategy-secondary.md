# fn-game-pass-strategy-secondary

**File:** `supabase/functions/game-pass-strategy-secondary/index.ts`
**Status:** New
**Prereqs:** fn-game-play-strategy-card

## Functionality

```pseudocode
CORS AUTH BODY(game_id, play_id) PLAYER GAME

STRATEGY_PLAY
ERR 409 if player.id === play.played_by_player_id ('Cannot pass your own secondary')

NEXT_RESPONDER(play_id)

update game_strategy_card_responses SET status='passed', responded_at=now() WHERE play_id AND player_id=caller

remaining = count game_strategy_card_responses WHERE play_id AND status='pending'
IF remaining === 0:
  update game_strategy_card_plays SET status='complete' WHERE id=play_id

OK({ passed: true, play_complete: remaining === 0 })
```

## Tests

```pseudocode
STD_MOCKS REQ(game_id, play_id)
T401 T400(game_id) T400(play_id) T404_PLAYER TCORS

T409('no active play')
T409('cannot pass own secondary')
T409('not your turn')

GIVEN caller is next pending:
  EXPECT response row status = 'passed'
  EXPECT play status = 'complete' if last pending
  EXPECT response { passed: true, play_complete: bool }
```
