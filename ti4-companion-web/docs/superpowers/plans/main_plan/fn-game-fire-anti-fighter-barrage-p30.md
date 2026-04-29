# fn-game-fire-anti-fighter-barrage-p30

**File:** `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
**Status:** Modify
**Prereqs:** fn-game-fire-anti-fighter-barrage (p13/p14), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Upgraded AFB stats + Plasma Scoring

```pseudocode
// Resolve upgraded Destroyer stats for AFB
baseStats = fetch units WHERE name='Destroyer'
resolvedStats = resolveUnitStats('Destroyer', baseStats, player.technologies)
// use resolvedStats.afb.dice and .combat

// Plasma Scoring: 1 unit firing AFB may roll 1 extra die
if 'Plasma Scoring' IN player.technologies:
  extraDieUnit = selections.plasma_scoring_unit
  resolvedStats.afb.dice += 1 for that unit only

roll using resolved AFB stats; return { results, hits }
```

## Tests

```pseudocode
GIVEN Destroyer II owned EXPECT upgraded AFB stats used
GIVEN Plasma Scoring owned EXPECT bonus die added to selected destroyer
```
