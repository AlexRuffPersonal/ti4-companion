# fn-game-produce-units-p43a
**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects

## Changes
After completing unit production, check for reactive agents triggered by PRODUCTION.

```pseudocode
// At end of handler, before final OK response:
reactiveAgents = []
allPlayers = fetch game_players WHERE game_id (excluding activating player)
for each otherPlayer in allPlayers:
  if otherPlayer.leaders?.agent === 'unlocked':
    if AGENT_REACTIVE_TRIGGERS[otherPlayer.faction]?.includes('PRODUCTION'):
      fetch leaders WHERE faction=otherPlayer.faction AND leader_type='agent'
      reactiveAgents.push({ player_id:otherPlayer.id, faction:otherPlayer.faction, agent_id:leader.id })

if reactiveAgents.length > 0:
  include pending_window: { type:'reactive_agent', eligible:reactiveAgents,
    context:{ trigger:'PRODUCTION', system_key:systemKey } } in OK response
```

## Tests
```pseudocode
// Extend existing game-produce-units test file:
describe('reactive agent window on production'):
  GIVEN Berekar Berekon (Winnu agent) unlocked in game:
    EXPECT response includes pending_window.type='reactive_agent'
  GIVEN no unlocked reactive production agents:
    EXPECT no pending_window
```
