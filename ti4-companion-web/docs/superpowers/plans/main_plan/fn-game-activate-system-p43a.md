# fn-game-activate-system-p43a
**File:** `supabase/functions/game-activate-system/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects

## Changes
After completing system activation, check for reactive agents triggered by SYSTEM_ACTIVATED.

```pseudocode
// At end of handler, before final OK response:
reactiveAgents = []
allPlayers = fetch game_players WHERE game_id (excluding activating player)
for each otherPlayer in allPlayers:
  if otherPlayer.leaders?.agent === 'unlocked':
    if AGENT_REACTIVE_TRIGGERS[otherPlayer.faction]?.includes('SYSTEM_ACTIVATED'):
      fetch leaders WHERE faction=otherPlayer.faction AND leader_type='agent'
      reactiveAgents.push({ player_id:otherPlayer.id, faction:otherPlayer.faction, agent_id:leader.id })

pendingWindows = existing pending_window array (if any)
if reactiveAgents.length > 0:
  pendingWindows.push({ type:'reactive_agent', eligible:reactiveAgents,
    context:{ trigger:'SYSTEM_ACTIVATED', system_key:systemKey } })

return okResponse({ ...existingResult, pending_window: pendingWindows.length > 0 ? pendingWindows[0] : undefined })
```

## Tests
```pseudocode
// Extend existing game-activate-system test file:
describe('reactive agent window on activation'):
  GIVEN Creuss player with unlocked agent in game:
    EXPECT response includes pending_window.type='reactive_agent'
    EXPECT eligible contains Creuss player_id
  GIVEN no players with unlocked reactive agents:
    EXPECT no pending_window in response
```
