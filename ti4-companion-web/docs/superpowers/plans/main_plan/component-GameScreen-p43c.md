# component-GameScreen-p43c
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useLeaders-p43c, component-CommanderRerollModal

## Changes
```pseudocode
// Extend pending_window handling switch to include commander windows:
case 'commander_passive':
  handleCommanderPassiveWindow(window)
  break
case 'commander_reroll':
  handleCommanderPassiveWindow(window)  // dispatches to reroll modal via hook
  break

// Render CommanderRerollModal when open:
if commanderRerollModalOpen AND commanderRerollWindow:
  <CommanderRerollModal
    window={commanderRerollWindow}
    onConfirm={handleCommanderRerollConfirm}
    onClose={() => setCommanderRerollModalOpen(false)}
  />

// Pass unlockCommander down to LeaderPanel (for the CHECK UNLOCK button for commanders):
<LeaderPanel
  ...existing props
  onUnlockCommander={unlockCommander}
/>
```

## Tests
No automated tests — wiring verified manually.
