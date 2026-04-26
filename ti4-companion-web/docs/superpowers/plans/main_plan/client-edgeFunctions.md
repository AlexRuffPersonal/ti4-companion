# client-edgeFunctions

**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-roll-ground-combat-dice, fn-game-assign-ground-hits, fn-game-play-strategy-card, fn-game-use-strategy-secondary, fn-game-pass-strategy-secondary, fn-game-produce-units, fn-game-fire-anti-fighter-barrage, fn-game-advance-barrage

## Changes

Add two exports after the existing combat exports:

```js
export const rollGroundCombatDice = (gameId, combatId) =>
  callFunction('game-roll-ground-combat-dice', { game_id: gameId, combat_id: combatId })

export const assignGroundHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-ground-hits', { game_id: gameId, combat_id: combatId, casualties })
```

// Phase 12 additions — add after Phase 11 exports:
export const playStrategyCard = (gameId, abilityDefinitionId, selections) =>
  callFunction('game-play-strategy-card', { game_id: gameId, ability_definition_id: abilityDefinitionId, selections })

export const useStrategySecondary = (gameId, playId, abilityDefinitionId, selections) =>
  callFunction('game-use-strategy-secondary', { game_id: gameId, play_id: playId, ability_definition_id: abilityDefinitionId, selections })

export const passStrategySecondary = (gameId, playId) =>
  callFunction('game-pass-strategy-secondary', { game_id: gameId, play_id: playId })

export const produceUnits = (gameId, systemKey, units, planetExhausts) =>
  callFunction('game-produce-units', { game_id: gameId, system_key: systemKey, units, planet_exhausts: planetExhausts })

// Phase 13 additions — add after Phase 12 exports:
export const fireAntiFighterBarrage = (gameId, combatId) =>
  callFunction('game-fire-anti-fighter-barrage', { game_id: gameId, combat_id: combatId })

export const advanceBarrage = (gameId, combatId) =>
  callFunction('game-advance-barrage', { game_id: gameId, combat_id: combatId })
```

## Tests

None — covered by component/hook integration.
