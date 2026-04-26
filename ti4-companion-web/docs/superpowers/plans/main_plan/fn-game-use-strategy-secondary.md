# fn-game-use-strategy-secondary

**File:** `supabase/functions/game-use-strategy-secondary/index.ts`
**Status:** New
**Prereqs:** fn-game-play-strategy-card

## Functionality

```pseudocode
CORS AUTH BODY(game_id, play_id, ability_definition_id, selections?) PLAYER GAME

STRATEGY_PLAY
ERR 409 if player.id === play.played_by_player_id ('Cannot use your own secondary')

NEXT_RESPONDER(play_id)  -- ERR 409 if caller is not the next pending player

// Validate ability belongs to this card's secondary
fetch ability_sources WHERE ability_definition_id AND source_type='strategy_card' AND source_id=play.card_number::text
ERR 404 if not found

// Resolve secondary effect via ability DSL
resolve ability_definition effects

// Mark this player's response as used
update game_strategy_card_responses SET status='used', responded_at=now() WHERE play_id AND player_id=caller

// If all responses resolved, complete the play
remaining = count game_strategy_card_responses WHERE play_id AND status='pending'
IF remaining === 0:
  update game_strategy_card_plays SET status='complete' WHERE id=play_id

OK({ responded: true, play_complete: remaining === 0 })
```

## Tests

```pseudocode
STD_MOCKS REQ(game_id, play_id, ability_definition_id)
T401 T400(game_id) T400(play_id) T400(ability_definition_id) T404_PLAYER TCORS

T409('no active play') — mock STRATEGY_PLAY returns null
T409('cannot use own secondary') — mock caller === played_by_player_id
T409('not your turn') — mock a different player as next pending (lower initiative_order)

GIVEN caller is next pending, valid secondary ability:
  EXPECT effect applied
  EXPECT response row status = 'used'
  EXPECT play status remains 'active' if other pending responses remain
  EXPECT play status = 'complete' if this was the last pending response
  EXPECT response { responded: true, play_complete: bool }
```
