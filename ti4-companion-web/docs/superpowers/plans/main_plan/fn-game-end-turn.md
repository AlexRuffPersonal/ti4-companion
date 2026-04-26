# fn-game-end-turn

**File:** `supabase/functions/game-end-turn/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-strategy-card

## Changes

Before advancing `active_player_id`, auto-pass any remaining pending secondary responses for the current player's strategy card play:

```pseudocode
// Insert after validating caller === active_player, before fetching next player:

activePay = query game_strategy_card_plays
  WHERE game_id AND played_by_player_id=callerPlayer.id AND status='active'

IF activePay exists:
  update game_strategy_card_responses SET status='passed', responded_at=now()
    WHERE play_id=activePay.id AND status='pending'
  update game_strategy_card_plays SET status='complete' WHERE id=activePay.id

// Then continue with existing next-player logic (unchanged)
```

## Tests

Extend existing `game-end-turn` test file:

```pseudocode
GIVEN an active strategy card play with pending responses:
  EXPECT all pending responses set to 'passed'
  EXPECT play status set to 'complete'

GIVEN no active strategy card play:
  EXPECT no game_strategy_card_plays queries made  ← regression: existing tests still pass
```
