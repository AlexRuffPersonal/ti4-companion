# component-GameScreen-p43a
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useLeaders-p43a

## Changes
```pseudocode
// In GameScreen, handle pending_window.type='reactive_agent' received from any Edge Function response:

// Existing pending_window handling (action cards etc.) already exists — extend the switch:
case 'reactive_agent':
  handleReactiveAgentWindow(window)  // dispatched to hook-useLeaders
  break

// Pass handleUseAbility, leaderModalOpen, activeLeader, handleConfirm, handleReactiveAgentWindow
// down to LeaderPanel via MyPanelSection → LeaderPanel prop chain
```

## Tests
No automated tests — wiring verified manually.
