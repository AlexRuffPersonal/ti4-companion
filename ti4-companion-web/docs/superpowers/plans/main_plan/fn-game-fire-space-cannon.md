# fn-game-fire-space-cannon

**File:** `supabase/functions/game-fire-space-cannon/index.ts`
**Status:** Modify
**Prereqs:** migration-030-afb

## Changes

Remove `hasDestroyer()` function entirely.

In the all-resolved branch, replace:
```ts
const atkHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.attacker_player_id)
const defHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.defender_player_id)
newPhase = (atkHasDestroyer || defHasDestroyer) ? 'barrage' : 'attacker_roll'
```
with:
```ts
newPhase = 'barrage'
```

Space cannon always hands off to `barrage`; the barrage phase owns the skip-if-no-AFB logic.

## Tests

Update `tests/functions/game-fire-space-cannon.test.js`.

```pseudocode
// Regression: T401 T400(...) T404_PLAYER T404_COMBAT T409(not space_cannon) T409(no entry) TCORS — unchanged

GIVEN allResolved=true (was: transitions to barrage only if destroyers present)
  EXPECT phase updated to 'barrage' unconditionally
  EXPECT response { phase: 'barrage' }

GIVEN allResolved=false
  EXPECT phase stays 'space_cannon'   // regression

// Remove: test cases that conditioned phase on destroyer presence
```
