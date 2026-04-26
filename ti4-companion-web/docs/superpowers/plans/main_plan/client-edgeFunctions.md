# client-edgeFunctions

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-roll-ground-combat-dice, fn-game-play-strategy-card, fn-game-use-strategy-secondary, fn-game-pass-strategy-secondary, fn-game-produce-units, fn-game-fire-anti-fighter-barrage, fn-game-advance-barrage, fn-game-fire-bombardment, fn-game-advance-bombardment, fn-game-commit-ground-forces, fn-game-fire-space-cannon-defense

## Changes

```js
// Phase 11 additions:
export const rollGroundCombatDice = (gameId, combatId) =>
  callFunction('game-roll-ground-combat-dice', { game_id: gameId, combat_id: combatId })

// Phase 12 additions:
export const playStrategyCard = (gameId, abilityDefinitionId, selections) =>
  callFunction('game-play-strategy-card', { game_id: gameId, ability_definition_id: abilityDefinitionId, selections })

export const useStrategySecondary = (gameId, playId, abilityDefinitionId, selections) =>
  callFunction('game-use-strategy-secondary', { game_id: gameId, play_id: playId, ability_definition_id: abilityDefinitionId, selections })

export const passStrategySecondary = (gameId, playId) =>
  callFunction('game-pass-strategy-secondary', { game_id: gameId, play_id: playId })

export const produceUnits = (gameId, systemKey, units, planetExhausts) =>
  callFunction('game-produce-units', { game_id: gameId, system_key: systemKey, units, planet_exhausts: planetExhausts })

// Phase 13 additions:
export const fireAntiFighterBarrage = (gameId, combatId) =>
  callFunction('game-fire-anti-fighter-barrage', { game_id: gameId, combat_id: combatId })

export const advanceBarrage = (gameId, combatId) =>
  callFunction('game-advance-barrage', { game_id: gameId, combat_id: combatId })

// Phase 14 additions:
export const fireBombardment = (gameId, systemKey, planetName) =>
  callFunction('game-fire-bombardment', { game_id: gameId, system_key: systemKey, planet_name: planetName })

export const advanceBombardment = (gameId, systemKey) =>
  callFunction('game-advance-bombardment', { game_id: gameId, system_key: systemKey })

export const commitGroundForces = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-commit-ground-forces', { game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount })

export const fireSpaceCannonDefense = (gameId, combatId) =>
  callFunction('game-fire-space-cannon-defense', { game_id: gameId, combat_id: combatId })

export const assignHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-hits', { game_id: gameId, combat_id: combatId, casualties })
```

Note: `assignGroundHits` is not added — `assignHits` covers all assignment contexts (space, ground, AFB, bombardment, SCD).

## Tests

None — covered by component/hook integration.
