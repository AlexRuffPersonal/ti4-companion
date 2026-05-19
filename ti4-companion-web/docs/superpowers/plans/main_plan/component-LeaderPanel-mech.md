# component-LeaderPanel-mech
**File:** `src/components/game/LeaderPanel.jsx`
**Status:** Modify
**Prereqs:** component-LeaderCard-mech

## Functionality
New props: `planets`, `currentPlayerId`, `onDeployMech`, `onUseMechAbility`.
Internal state: `showDeployModal` (boolean).

```
handleDeployConfirm(selected):
  planet = selected[0]
  replacingInfantry = (factionMech.deploy_trigger === 'ground_combat_start')
  onDeployMech(factionMech.id, planet.system_key, planet.planet_name, replacingInfantry)
  setShowDeployModal(false)
```

`LeaderCard` for mech gets `onDeploy={() => setShowDeployModal(true)}` and `onUseMechAbility={() => onUseMechAbility(factionMech)}`.

Renders `PlanetSelectionModal` when `showDeployModal` is true, passing `planets`, `currentPlayerId`, `scope='own'`, and `onConfirm/onClose`.

## Tests
- Covered by [[component-LeaderCard-mech]] unit tests and integration through [[component-MyPanelSection-mech]]
