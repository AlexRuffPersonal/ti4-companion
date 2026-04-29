# fn-game-explore-planet-p30

**File:** `supabase/functions/game-explore-planet/index.ts`
**Status:** Modify
**Prereqs:** fn-game-explore-planet (p17), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Pre-Fab Arcologies (Naaz-Rokha)

```pseudocode
// After exploration resolves:
if 'Pre-Fab Arcologies' IN player.technologies:
  UPDATE game_player_planets SET exhausted = false WHERE planet_name=exploredPlanet
```

## Tests

```pseudocode
GIVEN Pre-Fab Arcologies owned EXPECT explored planet readied after exploration
GIVEN Pre-Fab Arcologies not owned EXPECT planet exhaustion state unchanged
```
