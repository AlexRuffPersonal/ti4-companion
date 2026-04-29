# fn-game-advance-phase-p30

**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** fn-game-advance-phase (p19/p21), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Status Phase tech effects

After existing status phase logic, call `applyPassiveTechs` for each player:

```pseudocode
// Status phase: draw action cards
for each player in game:
  if 'Neural Motivator' IN player.technologies:
    draw 2 action cards (instead of base 1)
  else:
    draw 1 action card (existing logic)

// Status phase: gain command tokens
for each player in game:
  if 'Hyper Metabolism' IN player.technologies:
    gain 3 command tokens (instead of base 2)
  else:
    gain 2 command tokens (existing logic)

// Status phase start: Wormhole Generator
for each player where 'Wormhole Generator' IN player.technologies:
  // open window for Creuss player to place/move wormhole token
  open pending_action_window { type:'status_phase_wormhole', eligible:[player.id] }

// Status phase end: Bioplasmosis
for each player where 'Bioplasmosis' IN player.technologies:
  open pending_action_window { type:'after_status_phase', eligible:[player.id],
    context:{ effect:'redistribute_infantry' } }

// Clear all tech exhaustion for all players
UPDATE game_players SET exhausted_technologies = '{}' WHERE game_id = gameId
```

### Phase 30 — Strategy Phase end tech effects

On transition out of strategy phase:

```pseudocode
for each player where 'Quantum Datahub Node' IN player.technologies:
  open pending_action_window { type:'strategy_phase_end', eligible:[player.id],
    context:{ effect:'quantum_datahub_node' } }
```

## Tests

```pseudocode
GIVEN player owns Neural Motivator EXPECT 2 action cards drawn
GIVEN player owns Hyper Metabolism EXPECT 3 command tokens gained
GIVEN player owns Wormhole Generator EXPECT window opened
GIVEN status phase ends EXPECT exhausted_technologies cleared for all players
```
