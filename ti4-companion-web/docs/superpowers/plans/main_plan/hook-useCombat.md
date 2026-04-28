# hook-useCombat

**File:** `src/hooks/useCombat.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions, fn-game-play-combat-action-card, fn-game-pass-action-window

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

### Phase 14 (Full Invasion)

Import `fireBombardment`, `advanceBombardment`, `commitGroundForces`, `fireSpaceCannonDefense`, `assignHits` from `edgeFunctions.js`.

Add to returned object:

```js
fireBombardment: (systemKey, planetName) => fireBombardmentFn(gameId, systemKey, planetName),
advanceBombardment: (systemKey) => advanceBombardmentFn(gameId, systemKey),
commitGroundForces: (systemKey, planetName, troopCount) => commitGroundForcesFn(gameId, systemKey, planetName, troopCount),
fireSpaceCannonDefense: () => fireSpaceCannonDefenseFn(gameId, combat.id),
assignHits: (casualties) => assignHitsFn(gameId, combat.id, casualties),
```

Derive and expose `hasScdUnits` boolean:
- `hasScdUnits = planetUnits.some(u => u.player_id===combat?.defender_player_id && unitDefs.get(u.unit_type)?.space_cannon != null)`
- Where `planetUnits = systemUnits.filter(u => u.on_planet === combat?.planet_name)`

### Phase 20 (Space Combat Action Cards)

Import `playCombatActionCard`, `passActionWindow` from `edgeFunctions.js`.

Add to returned object:

```js
playActionCard: (cardId, targets) => playCombatActionCard(gameId, combat.id, cardId, targets),
passActionWindow: () => passActionWindowFn(gameId, combat.id),
```

Add derived state:

```js
isWindowPhase: combat?.phase?.startsWith('window_') ?? false,
windowCards: hand.filter(card => isCardValidForPhase(card, combat?.phase)),
windowPasses: combat?.window_passes ?? { attacker: false, defender: false },
localPlayerPassed: combat?.window_passes?.[mySide] ?? false,
```

`isCardValidForPhase(card, phase)` maps each card name to its valid window phase(s) — a local lookup table keyed by card name.

## Tests

None — covered by SpaceCombatModal and ActionCardWindowPanel tests.
