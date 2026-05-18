# fn-game-produce-units-p40
**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** shared-lawEffects

## Functionality
- Before producing each unit type, call assertProductionAllowed(db, game_id, unitType)
- If LawError thrown, propagate as errorResponse(err.message, 409)
- Call site: immediately before the unit-count validation / placement logic for each unit entry

## Tests
- Regulated Conscription active + produce carrier → 409 with law message
- Regulated Conscription active + produce infantry → succeeds
- Articles of War active + produce pds → 409
- No laws active → unchanged behavior
