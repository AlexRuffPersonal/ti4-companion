# fn-game-assign-hits-p40
**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** shared-lawEffects

## Functionality
- Before assigning a hit to a unit: call assertCombatHitAllowed(db, game_id, unitType)
- After planet control changes (when all ground forces of the defender are destroyed and attacker claims planet): call checkVpMaintenanceLaws(db, game_id, previousOwnerId, planetName)
  - previousOwnerId captured before control flip
- If LawError thrown on assertCombatHitAllowed, propagate as errorResponse(err.message, 409)

## Tests
- Conventions of War active + assign hit to fighter → 409
- Conventions of War active + assign hit to cruiser → succeeds
- VP maintenance law active + planet control flips in combat → VP deducted from previous owner
- No laws active → unchanged behavior
