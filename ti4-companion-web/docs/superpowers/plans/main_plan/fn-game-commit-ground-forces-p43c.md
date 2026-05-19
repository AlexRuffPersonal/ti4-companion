# fn-game-commit-ground-forces-p43c
**File:** `supabase/functions/game-commit-ground-forces/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// Before validating which planets forces can be committed from:
{ inlineEffects } = await applyCommanderPassives('GROUND_COMBAT_START', {
  gameId, activatingPlayerId: player.id, systemKey
}, db)

// Sol commander: context.extraInfantryBeforeCombat = 1 → place 1 infantry on target planet before commit
if inlineEffects includes sol_place_infantry:
  upsert game_player_units { game_id, player_id, on_planet:targetPlanet, unit_type:'infantry', count:1 }
    ON CONFLICT increment count

// Sardakk commander: context.sardakkExtendedCommit=true → allow commitment from adjacent planets
if context.sardakkExtendedCommit:
  eligiblePlanets = planets in active system AND planets in adjacent systems without player's own command tokens
else:
  eligiblePlanets = planets in active system only (standard rule)
```

## Tests
```pseudocode
describe('Sol commander — infantry placed before combat'):
  mock Sol player with unlocked commander
  EXPECT 1 infantry added to target planet before commitment

describe('Sardakk commander — extended commitment'):
  mock Sardakk player with unlocked commander
  EXPECT adjacent system planets are eligible for commitment
```
