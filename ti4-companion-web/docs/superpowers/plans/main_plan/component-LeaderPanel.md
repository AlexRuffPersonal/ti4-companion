# component-LeaderPanel
**File:** `src/components/game/LeaderPanel.jsx`
**Status:** New
**Prereqs:** component-LeaderCard

## Functionality
```pseudocode
LeaderPanel({ agent, commander, hero, factionMech, leaderStatus, onUseAbility, onUnlock })
  PANEL(lg):
    LABEL("LEADERS")
    2×2 grid:
      LeaderCard(agent,  leaderStatus.agent,     onUseAbility, onUnlock)
      LeaderCard(commander, leaderStatus.commander, onUseAbility, onUnlock)
      LeaderCard(hero,   leaderStatus.hero,      onUseAbility, onUnlock)
      LeaderCard(factionMech, "unlocked", isMech=true)
```

## Tests
No automated tests — pure display component; verified manually.
