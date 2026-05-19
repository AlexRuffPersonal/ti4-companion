# hook-useLeaders-mech
**File:** `src/hooks/useLeaders.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions-mech

## Functionality
Imports `deployMech` and `resolveMechAbility` from `edgeFunctions.js`.
Return object gains two new wrappers:
```
deployMech(unitId, systemKey, targetPlanetName, replacingInfantry)
  → deployMechFn(gameId, unitId, systemKey, targetPlanetName, replacingInfantry)

resolveMechAbility(unitId, selections)
  → resolveMechAbilityFn(gameId, unitId, selections)
```

## Tests
- `deployMech` calls underlying edge function with `gameId` prepended
- `resolveMechAbility` calls underlying edge function with `gameId` prepended
