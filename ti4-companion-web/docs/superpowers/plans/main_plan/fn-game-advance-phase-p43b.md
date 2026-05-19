# fn-game-advance-phase-p43b
**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** fn-game-advance-phase-p43a, migration-052-leader-abilities

## Changes
p43a added agent readying and game_round_flags clearing. Phase 40b adds no additional advance-phase changes — this spec confirms the round-flag clearing introduced in p43a also covers Letnev and Nomad hero flags set in p43b handlers.

No new code changes required. This spec tracks that the `game_round_flags = '{}'` reset already committed in p43a clears hero state correctly.

## Tests
```pseudocode
// Extend existing test:
describe('round end clears hero round flags'):
  mock game with game_round_flags={letnev_no_fleet_limit:true, nomad_flagship_ignores_tokens:true}
  advance to next round
  EXPECT game_round_flags = {}
```
