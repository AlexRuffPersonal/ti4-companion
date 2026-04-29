# fn-game-resolve-ability-p30

**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** fn-game-resolve-ability (p12/p16/p19/p21), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Temporal Command Suite (Nomad)

After any agent is exhausted (detected via `game-resolve-ability` resolving a leader ability that exhausts an agent):

```pseudocode
// After agent exhaust resolves:
nomadPlayer = find player where 'Temporal Command Suite' IN technologies
  AND 'Temporal Command Suite' NOT IN exhausted_technologies
if nomadPlayer AND exhaustedAgentOwnerId exists:
  open pending_action_window {
    type: 'agent_exhausted',
    eligible: [nomadPlayer.id],
    context: { exhausted_agent_id, agent_owner_player_id: exhaustedAgentOwnerId }
  }
// If Nomad responds:
//   exhaust 'Temporal Command Suite'
//   UPDATE leaders SET status='readied' WHERE id=exhausted_agent_id
//   if agent_owner_player_id != nomadPlayer.id: Nomad may perform transaction with agent owner
```

## Tests

```pseudocode
GIVEN Temporal Command Suite unexhausted, another player's agent just exhausted EXPECT window opened
GIVEN Temporal Command Suite already exhausted EXPECT no window opened
GIVEN Nomad owns the exhausted agent EXPECT window still opened (can still ready own agent)
```
