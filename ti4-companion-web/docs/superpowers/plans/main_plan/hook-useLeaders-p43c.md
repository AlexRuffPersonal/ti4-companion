# hook-useLeaders-p43c
**File:** `src/hooks/useLeaders.js`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p43c, hook-useLeaders-p43a

## Changes
```pseudocode
// Add to useLeaders return value:

unlockCommander(leaderId):
  call unlockCommander(gameId, leaderId)
  on success: refetch leaderStatus (or optimistically update leaders.commander='unlocked')

handleCommanderPassiveWindow(window):
  // Dispatched when GameScreen receives pending_window.type='commander_passive'
  // or 'commander_reroll'
  if window.type === 'commander_reroll':
    setCommanderRerollWindow(window)
    setCommanderRerollModalOpen(true)
  else if window.type === 'commander_passive':
    // Append to action window banner queue (same as action cards)
    addPendingWindow(window)

handleCommanderRerollConfirm(rerollIndices):
  call resolveCommanderReroll(gameId, commanderRerollWindow.combat_id, rerollIndices)
  setCommanderRerollModalOpen(false)
  setCommanderRerollWindow(null)

return {
  ...existing,
  unlockCommander, handleCommanderPassiveWindow,
  commanderRerollModalOpen, commanderRerollWindow,
  handleCommanderRerollConfirm,
}
```

## Tests
```pseudocode
it('unlockCommander calls edge function with leader id')
it('handleCommanderRerollConfirm calls resolveCommanderReroll and closes modal')
it('handleCommanderPassiveWindow opens reroll modal for commander_reroll type')
```
