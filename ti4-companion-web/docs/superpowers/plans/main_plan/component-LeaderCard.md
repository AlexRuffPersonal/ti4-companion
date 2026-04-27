# component-LeaderCard
**File:** `src/components/game/LeaderCard.jsx`
**Status:** New
**Prereqs:** hook-useLeaders

## Functionality
```pseudocode
LeaderCard({ leader, status, onUseAbility, onUnlock, isMech=false })
  if !leader → return null

  render panel-inset with:
    name + type badge (agent|commander|hero) or nothing for mech
    status chip (unlocked/exhausted/locked/purged) — not shown for mech
    ability text
    mech stats row (cost, combat, SUSTAIN) if isMech
    unlock_criteria text if leader is locked (non-mech)
    action button:
      agent unlocked  → "USE ABILITY" btn-primary → onUseAbility(leader)
      agent exhausted → "USE ABILITY" disabled
      commander locked → "CHECK UNLOCK" btn-ghost → onUnlock(leader)
      commander unlocked → italic "Passive — always active"
      hero locked → "CHECK UNLOCK" btn-ghost → onUnlock(leader)
      hero unlocked → "USE ABILITY" btn-primary → onUseAbility(leader)
      hero purged → entire card opacity-40, no button
      mech → no button
```

## Tests
No automated tests — pure display component; verified manually.
