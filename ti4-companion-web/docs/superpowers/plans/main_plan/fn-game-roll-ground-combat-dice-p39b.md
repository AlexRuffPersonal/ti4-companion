# fn-game-roll-ground-combat-dice-p39b
**File:** `supabase/functions/game-roll-ground-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-roll-ground-combat-dice-p30

## Functionality
- After dice roll: read game_combats.tekklar_holder_player_id
- If set: adjust each die result for the affected side:
  - Holder's rolls: +1 to each die value (capped at 10)
  - Owner's (Sardakk) rolls: −1 from each die value (floor at 1)
- Recompute hits after adjustment
- Note: tekklar_holder_player_id is a pre-existing column (migration 032)

## Tests (game-roll-ground-combat-dice.phase39b.test.js)
- tekklar_holder_player_id set, caller is holder → each die +1
- tekklar_holder_player_id set, caller is Sardakk owner → each die −1
- tekklar_holder_player_id null → no modification
