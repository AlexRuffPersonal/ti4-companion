# fn-game-end-turn-p30

**File:** `supabase/functions/game-end-turn/index.ts`
**Status:** Modify
**Prereqs:** fn-game-end-turn (p12), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Fleet Logistics and Bio-Stims

```pseudocode
// Fleet Logistics: allow a second action per turn
if 'Fleet Logistics' IN player.technologies:
  if NOT player.second_action_available AND player has not yet taken bonus action:
    UPDATE game_players SET second_action_available = true WHERE id=player.id
    // do not end turn yet; client shows "take second action" prompt
    return OK({ second_action_available: true })
  else:
    // second action taken or declined; clear flag and end turn normally
    UPDATE game_players SET second_action_available = false WHERE id=player.id

// Bio-Stims: exhaust at end of turn to ready 1 planet with tech specialty or 1 technology
if 'Bio-Stims' IN player.technologies AND NOT exhausted AND selections.bio_stims_target:
  target = selections.bio_stims_target  // { type: 'planet'|'technology', name }
  if target.type === 'planet':
    UPDATE game_player_planets SET exhausted = false WHERE planet_name=target.name
  if target.type === 'technology':
    UPDATE game_players SET exhausted_technologies = array_remove(..., target.name)
  UPDATE game_players SET exhausted_technologies = array_append(..., 'Bio-Stims')
```

## Tests

```pseudocode
GIVEN Fleet Logistics owned, first end-turn call EXPECT second_action_available=true; turn not ended
GIVEN Fleet Logistics owned, second end-turn call EXPECT flag cleared; turn ends normally
GIVEN Bio-Stims unexhausted, target planet selected EXPECT planet readied; Bio-Stims exhausted
GIVEN Bio-Stims unexhausted, target technology selected EXPECT tech unexhausted; Bio-Stims exhausted
```
