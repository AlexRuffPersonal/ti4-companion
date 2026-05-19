# component-LeaderCard-mech
**File:** `src/components/game/LeaderCard.jsx`
**Status:** Modify
**Prereqs:** hook-useLeaders-mech

## Functionality
Signature gains two new optional props: `onDeploy`, `onUseMechAbility`.

The `if (isMech)` branch (previously `actionButton = null`) now:
```
hasDeploy = !!leader.deploy_trigger
hasActiveEffect = Array.isArray(leader.effects) && leader.effects.length > 0
if hasDeploy || hasActiveEffect:
  actionButton = <div flex gap-2>
    if hasDeploy: <button btn-ghost onClick=onDeploy>DEPLOY</button>
    if hasActiveEffect: <button btn-primary onClick=onUseMechAbility>USE ABILITY</button>
  </div>
```
All non-mech `actionButton` assignments gain their own wrapper `<div className="mt-auto pt-1">` so the render footer simplifies to `{!isPurged && actionButton}`.

## Tests
- Passive mech (no effects, no deploy_trigger) → no buttons rendered
- Mech with deploy_trigger → DEPLOY button calls `onDeploy`
- Mech with effects → USE ABILITY button calls `onUseMechAbility`
- Mech with both → both buttons shown
- Renders `ability_text` and unit stats (COST, COMBAT)
