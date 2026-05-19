# fn-game-produce-units-p43c
**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// At start of production: gather all unlocked commander passives for PRODUCTION trigger
{ inlineEffects, pendingWindows } = await applyCommanderPassives('PRODUCTION', {
  gameId, activatingPlayerId: player.id, systemKey,
  unitTypes: requestedUnits.map(u => u.unit_type)
}, db)

// Apply inline effects before cost/limit calculation:
// - vuil_production_limit_bypass: context.freeFromLimitCount units skip limit
// - nomad_free_flagship: context.flagshipCostOverride=0 for flagship cost check
// - naalu_extra_fighter: context.extraFightersFreeOfLimit += 1
// - yin_omar_passive: context.extraInfantryFree = 1

// After production completes, append pendingWindows to response:
// - Titans commander window (gain TG)
// - Saar commander window (place anywhere at space dock)
```

## Tests
```pseudocode
describe('Vuil\'raith commander — production limit bypass'):
  mock player is Vuil'raith with unlocked commander
  produce 3 fighters with limit = 2
  EXPECT production succeeds (2 bypass limit)

describe('Nomad commander — free flagship'):
  mock Nomad player with unlocked commander
  produce flagship with 0 resources
  EXPECT production succeeds

describe('Titans commander — window emitted'):
  mock Titans player with unlocked commander
  EXPECT pending_window.type='commander_passive' in response
```
