# hook-useCombat

**File:** `src/hooks/useCombat.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions

## Changes

Import `rollGroundCombatDice`, `assignGroundHits` from `edgeFunctions.js`.

Add to returned object:

```js
rollGroundDice: () => rollGroundCombatDiceFn(gameId, combatId),
assignGroundHits: (casualties) => assignGroundHitsFn(gameId, combatId, casualties),
```

No other changes — existing Realtime subscription already handles ground combat rows (same `game_combats` table).

## Tests

None — covered by GroundCombatModal tests.
