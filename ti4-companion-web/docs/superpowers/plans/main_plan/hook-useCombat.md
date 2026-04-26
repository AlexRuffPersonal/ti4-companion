# hook-useCombat

**File:** `src/hooks/useCombat.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions

## Changes

### Phase 11 (Ground Combat)

Import `rollGroundCombatDice`, `assignGroundHits` from `edgeFunctions.js`.

Add to returned object:

```js
rollGroundDice: () => rollGroundCombatDiceFn(gameId, combatId),
assignGroundHits: (casualties) => assignGroundHitsFn(gameId, combatId, casualties),
```

No other changes — existing Realtime subscription already handles ground combat rows (same `game_combats` table).

### Phase 13 (Anti-Fighter Barrage)

Import `fireAntiFighterBarrage`, `advanceBarrage` from `edgeFunctions.js`.

Add to returned object:

```js
fireAntiFighterBarrage: () => fireAntiFighterBarrageFn(gameId, combat.id),
advanceBarrage: () => advanceBarrageFn(gameId, combat.id),
```

Derive and expose `hasAfbUnits` boolean:
- Join `systemUnits` (already fetched) against unit defs loaded by the hook
- `hasAfbUnits = systemUnits.some(u => u.system_key===combat.system_key && u.on_planet===null && unitDefs.get(u.unit_type)?.afb != null)`
- Include both attacker and defender units in the check

## Tests

None — covered by SpaceCombatModal and GroundCombatModal tests.
