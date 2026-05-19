# fn-game-fire-space-cannon-p39b
**File:** `supabase/functions/game-fire-space-cannon/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-space-cannon-p30, shared-promissoryEnforcement-p39a

## Functionality
- Before rolling: getHeldNotes(gameId, 'Strike Wing Ambuscade', db)
- If any held note with holderPlayerId = activatingPlayerId:
  - Allow caller to specify selections.ambuscade_unit_type
  - Add 1 extra die for that unit type's space cannon stat
  - returnNote after use

## Tests (game-fire-space-cannon.phase39b.test.js)
- Strike Wing Ambuscade held by caller → +1 die for chosen unit; note returned
- Strike Wing Ambuscade not held → no extra die
