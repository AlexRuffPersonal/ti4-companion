# fn-game-fire-space-cannon-p30

**File:** `supabase/functions/game-fire-space-cannon/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-space-cannon (p13), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Tech effects for space cannon

```pseudocode
// Resolve upgraded PDS stats
baseStats = fetch units WHERE name='PDS'
resolvedStats = resolveUnitStats('PDS', baseStats, player.technologies)
// use resolvedStats.spaceCannon.dice and .combat

// Plasma Scoring: 1 unit may roll 1 extra die
if 'Plasma Scoring' IN player.technologies:
  extraDieUnit = selections.plasma_scoring_unit  // which PDS gets the bonus die
  resolvedStats.spaceCannon.dice += 1 for that unit only

// Graviton Laser System: hits must assign to non-fighters
gravitonActive = false
if 'Graviton Laser System' IN player.technologies AND NOT exhausted:
  if selections.use_graviton:
    gravitonActive = true
    UPDATE game_players SET exhausted_technologies = array_append(..., 'Graviton Laser System')

// Antimass Deflectors: apply -1 to each die roll against Antimass owner
if 'Antimass Deflectors' IN target.technologies:
  subtract 1 from each die result (minimum 1) before hit check

// L4 Disruptors: during invasion, cannot fire at Letnev units
if context.is_invasion AND 'L4 Disruptors' IN target.technologies:
  ERR 409 'Space Cannon cannot target Letnev units during invasion'

roll dice; return { results, hits, gravitonActive }
// if gravitonActive=true, game-assign-hits enforces non-fighter assignment
```

## Tests

```pseudocode
GIVEN PDS II owned EXPECT upgraded spaceCannon stats used
GIVEN Plasma Scoring owned EXPECT bonus die added to selected PDS
GIVEN Graviton Laser System unexhausted, use_graviton=true EXPECT tech exhausted; gravitonActive=true in response
GIVEN target owns Antimass Deflectors EXPECT -1 to each die result
GIVEN invasion context AND target owns L4 Disruptors EXPECT 409
```
