# fn-game-land-troops-p40
**File:** `supabase/functions/game-land-troops/index.ts`
**Status:** Modify
**Prereqs:** shared-lawEffects

## Functionality
- Before landing: call assertMovementAllowed(db, game_id, planetName)
- After planet control changes (existing CLAIM_PLANET logic completes): call checkVpMaintenanceLaws(db, game_id, previousOwnerId, planetName)
  - previousOwnerId must be captured before CLAIM_PLANET runs (query existing owner from game_player_planets)
- If LawError thrown on assertMovementAllowed, propagate as errorResponse(err.message, 409)

## Tests
- Demilitarized Zone active + landing on elected planet → 409
- Holy Planet / Shard / Crown active + previous owner loses planet control → VP deducted
- No laws active → unchanged behavior
