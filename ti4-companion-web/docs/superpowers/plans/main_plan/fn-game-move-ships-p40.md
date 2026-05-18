# fn-game-move-ships-p40
**File:** `supabase/functions/game-move-ships/index.ts`
**Status:** Modify
**Prereqs:** shared-lawEffects

## Functionality
- For each destination planet included in the move payload, call assertMovementAllowed(db, game_id, planetName)
- Call assertFleetCapacity(db, game_id, player_id, newFleetSize) where newFleetSize = count of ships being moved into the destination system
- If LawError thrown, propagate as errorResponse(err.message, 409)

## Tests
- Demilitarized Zone active + ship moving to elected planet → 409
- Fleet Regulations active + fleet size exceeds max-2 → 409
- No laws active → unchanged behavior
