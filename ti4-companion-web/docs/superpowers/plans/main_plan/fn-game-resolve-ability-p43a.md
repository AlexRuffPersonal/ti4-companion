# fn-game-resolve-ability-p43a
**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects, shared-abilityDsl-p43a, shared-abilityHandlers-p43a

## Changes
Add the leader branch in step 6 (source side-effects), after the existing relic/action_card purge handling.

```pseudocode
if source_type === 'leader' AND source_id:
  fetch leaders WHERE id = source_id → { faction, leader_type }
  ERR 404 'Leader not found' if missing
  fetch game_players WHERE id=player.id → { leaders JSONB }

  if leader_type === 'agent':
    ERR 409 'Agent is already exhausted' if leaders.agent === 'exhausted'
    ops = AGENT_ABILITIES[faction]
    if ops is string: handlerFn = getHandler(ops); await handlerFn(context, db)
    else: await interpretEffects(ops, context, db)
    UPDATE game_players SET leaders = jsonb_set(leaders, '{agent}', '"exhausted"') WHERE id=player.id

  if leader_type === 'hero':
    ERR 409 'Hero not unlocked' if leaders.hero !== 'unlocked'
    ops = HERO_ABILITIES[faction]
    if ops is string: handlerFn = getHandler(ops); await handlerFn(context, db)
    else: await interpretEffects(ops, context, db)
    if faction !== 'The Titans Of Ul':
      UPDATE game_players SET leaders = jsonb_set(leaders, '{hero}', '"purged"') WHERE id=player.id
    // Titans: hero handler attaches card to Elysium instead; no purge write here

// After main execution, check for reactive agent windows:
reactiveAgents = []
for each game_player in game (excluding activating player):
  if player.leaders.agent === 'unlocked':
    agentFaction = player.faction
    if AGENT_REACTIVE_TRIGGERS[agentFaction] includes current trigger type:
      fetch leaders WHERE faction=agentFaction AND leader_type='agent'
      reactiveAgents.push({ player_id, faction: agentFaction, agent_id: leader.id })

if reactiveAgents.length > 0:
  include pending_window: { type:'reactive_agent', eligible:reactiveAgents, context:{ trigger, ...actionContext } }
  in OK response
```

Note: reactive agent checks are also added in `fn-game-activate-system`, `fn-game-produce-units`, and `fn-game-assign-hits` (see those spec files).

## Tests
```pseudocode
STD_MOCKS
// Add to existing game-resolve-ability test file:

describe('leader agent activation'):
  T409('agent already exhausted') — mock leaders.agent='exhausted'
  GIVEN source_type='leader', leader_type='agent', faction='The Titans Of Ul':
    EXPECT interpretEffects called with cancel_hit op
    EXPECT game_players.leaders.agent updated to 'exhausted'

describe('leader hero activation'):
  T409('hero not unlocked') — mock leaders.hero='locked'
  GIVEN source_type='leader', leader_type='hero', faction='The Federation Of Sol':
    EXPECT reclaim_command_tokens op executed
    EXPECT game_players.leaders.hero updated to 'purged'
  GIVEN faction='The Titans Of Ul':
    EXPECT hero handler called
    EXPECT no purge write to game_players

describe('reactive agent windows'):
  GIVEN another player has unlocked Creuss agent AND trigger is SYSTEM_ACTIVATED:
    EXPECT pending_window.type='reactive_agent' in response
    EXPECT eligible contains Creuss player
```
