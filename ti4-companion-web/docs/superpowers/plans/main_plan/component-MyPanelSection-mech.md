# component-MyPanelSection-mech
**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** component-LeaderPanel-mech

## Functionality
The `<LeaderPanel>` call gains four new props threaded from the parent:
```
planets={planets}
currentPlayerId={player?.id}
onDeployMech={(unitId, systemKey, planetName, replacingInfantry) =>
  leaders.deployMech(unitId, systemKey, planetName, replacingInfantry)}
onUseMechAbility={(mech) => leaders.resolveMechAbility(mech.id, {})}
```

## Tests
- New props are additive with defaults — existing MyPanelSection tests continue to pass without changes
