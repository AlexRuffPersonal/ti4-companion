# fn-game-research-technology-p30

**File:** `supabase/functions/game-research-technology/index.ts`
**Status:** Modify
**Prereqs:** fn-game-research-technology-p29b, migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — AI Development Algorithm prerequisite skip + Inheritance Systems

```pseudocode
// AI Development Algorithm: exhaust to ignore all prerequisites on a unit upgrade
if 'AI Development Algorithm' IN player.technologies AND NOT exhausted:
  if tech is unit_upgrade AND selections.use_ai_dev_algo:
    skip prerequisite check entirely
    UPDATE game_players SET exhausted_technologies = array_append(..., 'AI Development Algorithm')

// Inheritance Systems (L1Z1X): exhaust + spend 2 resources to ignore all prerequisites
if 'Inheritance Systems' IN player.technologies AND NOT exhausted:
  if selections.use_inheritance:
    ERR 409 'Insufficient resources' if player resources + trade_goods < 2
    spend 2 resources (from planets + TGs)
    skip prerequisite check entirely
    UPDATE game_players SET exhausted_technologies = array_append(..., 'Inheritance Systems')
```

## Tests

```pseudocode
GIVEN AI Development Algorithm unexhausted, tech is unit upgrade, use_ai_dev_algo=true EXPECT prereqs skipped; tech exhausted
GIVEN Inheritance Systems unexhausted, 2+ resources available, use_inheritance=true EXPECT prereqs skipped; 2 resources spent; tech exhausted
GIVEN Inheritance Systems unexhausted, <2 resources EXPECT 409
```
