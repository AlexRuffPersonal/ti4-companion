# component-GalaxyTab

**File:** `src/components/game/GalaxyTab.jsx`
**Status:** Modify
**Prereqs:** component-GroundCombatModal

## Changes

```pseudocode
import GroundCombatModal

destructure rollGroundDice, assignGroundHits from useCombat(...)

derive:
  spaceCombatActive = combatActive && combat?.combat_type === 'space'
  groundCombatActive = combatActive && combat?.combat_type === 'ground'

  showSpaceCannon = spaceCombatActive && combat.phase === 'space_cannon'
  showSpaceCombat = (spaceCombatActive && phase !== 'space_cannon') || completedCombat?.combat_type === 'space'
  showGroundCombat = groundCombatActive || completedCombat?.combat_type === 'ground'

add after CombatModal:
  {showGroundCombat && (
    <GroundCombatModal
      combat={displayCombat}
      myPlayerId={myPlayerId}
      players={players}
      systemUnits={systemUnits}
      onRollGroundDice={rollGroundDice}
      onAssignGroundHits={assignGroundHits}
      onClose={() => setCompletedCombat(null)}
    />
  )}
```

`useGalaxy` requires no changes — its `game_combats` Realtime subscription already fires on INSERT and sets `activeCombat` regardless of `combat_type`.

## Tests

No new test file. Existing GalaxyTab tests must still pass. If a GalaxyTab test file exists, add one smoke case:

```pseudocode
GIVEN activeCombat with combat_type='ground':
  EXPECT GroundCombatModal rendered
  EXPECT CombatModal NOT rendered
```

## Deploy (after all other tasks complete)

```bash
supabase functions deploy game-land-troops --no-verify-jwt
supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
supabase functions deploy game-assign-ground-hits --no-verify-jwt
supabase db push
```
