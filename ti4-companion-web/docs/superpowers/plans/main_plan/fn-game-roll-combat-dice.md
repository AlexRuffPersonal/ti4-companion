# fn-game-roll-combat-dice

**File:** `supabase/functions/game-roll-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-anti-fighter-barrage

## Changes

Remove the `barrage` phase block (current lines ~100–148) and its helper `applyAfbHits`.

Update `rollPhases` constant:
```ts
const rollPhases = ['attacker_roll', 'defender_roll']
```

No other changes — `parseStat`, `rollDice` helpers are still used for main combat rolls.

## Tests

Update `tests/functions/game-roll-combat-dice.test.js`.

```pseudocode
// Regression: T401 T400(...) T404_PLAYER T404_COMBAT TCORS — unchanged

T409('combat is not a roll phase') — mock phase='barrage'   // barrage now rejected here

// Remove: all 'barrage phase' test cases
// Regression: attacker_roll and defender_roll cases unchanged
```

### Phase 19 Changes

Add `hit_on` to `DieResult` so `modify_roll` (in `abilityDsl.ts`) can recompute hit flags after adjusting values:

```ts
// Change:
type DieResult = { unit_type: string; roll: number; hit: boolean }
// To:
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }

// In rollDice(), change:
results.push({ unit_type: unit.unit_type, roll, hit })
// To:
results.push({ unit_type: unit.unit_type, roll, hit_on: value, hit })
```

Update existing tests to assert `hit_on` is present in each returned die entry.
