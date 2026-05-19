# client-edgeFunctions-mech
**File:** `src/lib/edgeFunctions.js`
**Status:** Modify
**Prereqs:** fn-game-deploy-mech, fn-game-resolve-ability-mech

## Functionality
Two new exports added after `resolveAbility`:
```
deployMech(gameId, unitId, systemKey, targetPlanetName, replacingInfantry=false)
  → callFunction('game-deploy-mech', { game_id, unit_id, system_key, target_planet_name, replacing_infantry })

resolveMechAbility(gameId, unitId, selections={})
  → callFunction('game-resolve-ability', { game_id, source_type:'mech', source_id:unitId, selections })
```

## Tests
- Covered by [[hook-useLeaders-mech]] tests which mock and verify these exports
