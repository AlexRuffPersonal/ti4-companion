# hook-useLeaders-p43a
**File:** `src/hooks/useLeaders.js`
**Status:** Modify
**Prereqs:** component-LeaderAbilityModal, lib-leaderConstants

## Changes
```pseudocode
// Add to useLeaders return value:

// Modal state
[leaderModalOpen, setLeaderModalOpen] = useState(false)
[activeLeader, setActiveLeader] = useState(null)

handleUseAbility(leader):
  setActiveLeader(leader)
  setLeaderModalOpen(true)

handleConfirm(selections):
  setLeaderModalOpen(false)
  resolveLeaderAbility(activeLeader.abilityDefinitionId, activeLeader.id, selections)

// Reactive agent window handler (called when GameScreen receives pending_window.type='reactive_agent')
handleReactiveAgentWindow(window):
  // find the eligible entry for this player
  eligible = window.eligible.find(e => e.player_id === currentPlayer.id)
  if eligible:
    setActiveLeader({ ...agent, leaderType:'agent', isReactive:true, windowContext:window.context })
    setLeaderModalOpen(true)

return {
  ...existing,
  leaderModalOpen, activeLeader,
  handleUseAbility, handleConfirm, handleReactiveAgentWindow,
}
```

## Tests
```pseudocode
// Extend existing useLeaders test file:
it('handleUseAbility opens modal with correct leader')
it('handleConfirm calls resolveLeaderAbility with selections and closes modal')
it('handleReactiveAgentWindow opens modal when current player is eligible')
it('handleReactiveAgentWindow does nothing when current player not eligible')
```
