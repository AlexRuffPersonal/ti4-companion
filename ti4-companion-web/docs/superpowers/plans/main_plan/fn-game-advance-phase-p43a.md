# fn-game-advance-phase-p43a
**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** migration-052-leader-abilities, shared-leaderEffects

## Changes
In the "Ready Cards" step of the status phase, ready exhausted agents. At round end, clear `game_round_flags`.

```pseudocode
// In status phase "Ready Cards" step (alongside existing technology readying):
UPDATE game_players
  SET leaders = jsonb_set(leaders, '{agent}', '"unlocked"')
  WHERE game_id = gameId AND leaders->>'agent' = 'exhausted'

// At end of game round (when advancing from agenda phase back to strategy phase):
UPDATE games SET game_round_flags = '{}' WHERE id = gameId
```

## Tests
```pseudocode
// Extend existing game-advance-phase test file:
describe('status phase readies exhausted agents'):
  mock 2 players: one with leaders.agent='exhausted', one with leaders.agent='unlocked'
  EXPECT first player's leaders.agent updated to 'unlocked'
  EXPECT second player unchanged

describe('round end clears game_round_flags'):
  mock game with game_round_flags={letnev_no_fleet_limit:true}
  EXPECT game_round_flags reset to {}
```
