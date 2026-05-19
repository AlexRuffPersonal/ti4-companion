# component-LeaderPanel-p43a
**File:** `src/components/game/LeaderPanel.jsx`
**Status:** Modify
**Prereqs:** hook-useLeaders-p43a, component-LeaderAbilityModal

## Changes
```pseudocode
// LeaderPanel receives handleUseAbility from hook-useLeaders and passes to LeaderCard
// Also renders LeaderAbilityModal when leaderModalOpen=true

LeaderPanel({ leaders, leaderStatus, onUseAbility, onUnlock, leaderModalOpen, activeLeader,
               onConfirm, onClose, gamePlayers })
  render:
    existing LeaderCard components with onUseAbility=onUseAbility

    if leaderModalOpen AND activeLeader:
      <LeaderAbilityModal
        leader={activeLeader}
        faction={currentPlayer.faction}
        leaderType={activeLeader.leader_type}
        gamePlayers={gamePlayers}
        onConfirm={onConfirm}
        onClose={onClose}
      />
```

## Tests
No automated tests — wiring verified manually.
