# fn-game-commit-ground-forces-p39b
**File:** `supabase/functions/game-commit-ground-forces/index.ts`
**Status:** Modify
**Prereqs:** fn-game-commit-ground-forces (p21), shared-promissoryEnforcement-p39a

## Functionality
- After ground forces committed to a planet: getHeldNotes(gameId, "Ragh's Call", db)
- For each held note where holderPlayerId = activatingPlayerId (the invader):
  - Eject ownerPlayerId's (Saar's) ground forces from the invaded planet → move them to a Saar-controlled planet (selections.saar_retreat_planet)
  - UPDATE game_player_units: remove Saar's ground forces from invaded planet, add to retreat planet
  - returnNote

## Tests (game-commit-ground-forces.phase39b.test.js)
- Ragh's Call held by invader, Saar has ground forces on planet → Saar forces ejected; note returned
- Ragh's Call not held → no ejection
