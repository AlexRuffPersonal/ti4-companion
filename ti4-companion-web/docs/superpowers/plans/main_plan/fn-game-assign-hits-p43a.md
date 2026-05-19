# fn-game-assign-hits-p43a
**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects

## Changes
After processing hits, check for reactive agents triggered by SUSTAIN_DAMAGE or GROUND_COMBAT_START.

```pseudocode
// After hits applied, check if any sustain damage was used this resolution:
if sustainDamageOccurred:
  reactiveAgents = collectReactiveAgents(allPlayers, 'SUSTAIN_DAMAGE', excludeId=player.id)
  if reactiveAgents.length > 0: append reactive_agent window to response

// After ground forces committed (GROUND_COMBAT_START trigger):
if context.phase === 'ground_combat_start':
  reactiveAgents = collectReactiveAgents(allPlayers, 'GROUND_COMBAT_START', excludeId=player.id)
  if reactiveAgents.length > 0: append reactive_agent window
```

`collectReactiveAgents(players, trigger, excludeId)` is a shared helper (can be in `leaderEffects.ts`):
```pseudocode
function collectReactiveAgents(players, trigger, excludeId):
  return players
    .filter(p => p.id !== excludeId AND p.leaders?.agent === 'unlocked')
    .filter(p => AGENT_REACTIVE_TRIGGERS[p.faction]?.includes(trigger))
    .map(p => ({ player_id:p.id, faction:p.faction }))
```

## Tests
```pseudocode
describe('reactive agent on sustain damage'):
  GIVEN Titans player with unlocked agent, sustain damage occurs:
    EXPECT pending_window.type='reactive_agent' with Titans agent eligible
```
