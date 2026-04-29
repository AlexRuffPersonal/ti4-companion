# fn-game-roll-ground-combat-dice-p30

**File:** `supabase/functions/game-roll-ground-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-roll-ground-combat-dice (p11), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Unit upgrade stats + ground combat tech effects

```pseudocode
// Before rolling: resolve upgraded stats
for each unitGroup in ground units to roll:
  baseStats = fetch from units reference table
  resolvedStats = resolveUnitStats(unitGroup.unit_type, baseStats, player.technologies)
  use resolvedStats.combat and resolvedStats.dice for ROLL_DICE

// Magen Defense Grid (start of combat round)
if 'Magen Defense Grid' IN defender.technologies AND NOT exhausted:
  planetHasPlanetaryShield = check if any defender unit on this planet has Planetary Shield
  if planetHasPlanetaryShield AND selections.use_magen:
    // opponent skips rolls this round
    UPDATE game_players SET exhausted_technologies = array_append(..., 'Magen Defense Grid')
    skip attacker rolls for this round

// Supercharge (start of combat round)
if 'Supercharge' IN player.technologies AND NOT exhausted AND selections.use_supercharge:
  apply +1 to all roll results after rolling
  UPDATE game_players SET exhausted_technologies = array_append(..., 'Supercharge')

// Valkyrie Particle Weave (after rolls, if opponent produced hits)
if 'Valkyrie Particle Weave' IN player.technologies:
  if opponentHits > 0:
    player hits += 1  // 1 additional hit beyond what was rolled

// Duranium Armor (after hits assigned)
if 'Duranium Armor' IN player.technologies:
  // same repair logic as space combat
  repair 1 already-damaged unit that did not use Sustain this round
```

## Tests

```pseudocode
GIVEN Infantry II owned EXPECT resolveUnitStats applied
GIVEN Magen Defense Grid owned, planet has PDS, use_magen=true EXPECT opponent skips rolls; tech exhausted
GIVEN Supercharge owned, use_supercharge=true EXPECT +1 to all rolls; tech exhausted
GIVEN Valkyrie Particle Weave owned AND opponent produced 2 hits EXPECT player hits += 1
```
