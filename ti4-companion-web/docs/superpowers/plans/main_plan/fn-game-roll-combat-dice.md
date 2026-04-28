# fn-game-roll-combat-dice

**File:** `supabase/functions/game-roll-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-anti-fighter-barrage, migration-036-combat-action-cards

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

### Phase 20 Changes

Before rolling, read `pending_effects` from the combat row:
- `morale_boost_{side}`: add N to each die result after rolling; clear key after use
- `fighter_prototype_{side}`: add 2 to each fighter die result (only valid round=1); clear after use
- `waylay_{side}` (AFB path only): hits produced apply to all ship types, not just fighters; clear after use

```pseudocode
// In rollDice() after computing raw rolls:
boost = pending_effects.morale_boost_{side} ?? 0
fighterBoost = (round===1 && pending_effects.fighter_prototype_{side}) ? 2 : 0
for each result:
  if result.unit_type === 'fighter': result.roll += boost + fighterBoost
  else: result.roll += boost
  result.hit = result.roll >= result.hit_on

// Clear consumed keys:
delete pending_effects.morale_boost_{side}
delete pending_effects.fighter_prototype_{side}
UPDATE game_combats SET pending_effects=<updated>
```

After rolling, transition phase to `'window_pre_assign_defender'` (was direct `defender_assign`) or `'window_pre_assign_attacker'` depending on which roll phase just completed.

```pseudocode
// Phase 20 tests

GIVEN attacker_roll, pending_effects={morale_boost_attacker:1}, unit cruiser roll=6, hit_on=7
  EXPECT roll stored as 7, hit=true
  EXPECT pending_effects.morale_boost_attacker cleared
  EXPECT phase='window_pre_assign_defender'

GIVEN attacker_roll, fighter_prototype_attacker=true, round=1, fighter roll=5, hit_on=9
  EXPECT roll stored as 7 (5+2), hit=false
  EXPECT phase='window_pre_assign_defender'

GIVEN fighter_prototype_attacker=true but round=2
  EXPECT +0 bonus applied (ignored after round 1)
```
