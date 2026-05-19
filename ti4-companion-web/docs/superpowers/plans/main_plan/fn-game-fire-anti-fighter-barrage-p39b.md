# fn-game-fire-anti-fighter-barrage-p39b
**File:** `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-anti-fighter-barrage (p13/p14), shared-promissoryEnforcement-p39a

## Functionality
- Before rolling: getHeldNotes(gameId, 'Strike Wing Ambuscade', db)
- If any held note with holderPlayerId = activatingPlayerId:
  - Allow caller to specify a unit type via selections.ambuscade_unit_type
  - Add 1 extra die roll for that unit type's AFB stat
  - returnNote after use

## Tests (game-fire-anti-fighter-barrage.phase39b.test.js)
- Strike Wing Ambuscade held by caller, ambuscade_unit_type set → +1 die for that unit; note returned
- Strike Wing Ambuscade not held → no extra die
