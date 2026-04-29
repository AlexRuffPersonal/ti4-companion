# fn-game-roll-combat-dice-p30

**File:** `supabase/functions/game-roll-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** fn-game-roll-combat-dice (p13/p20), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Unit upgrade stat resolution + combat tech effects

```pseudocode
// Before rolling: resolve upgraded stats for each unit type
for each unitGroup in units to roll:
  baseStats = fetch from units reference table WHERE name=unitGroup.unit_type
  resolvedStats = resolveUnitStats(unitGroup.unit_type, baseStats, player.technologies)
  use resolvedStats.combat and resolvedStats.dice for ROLL_DICE

// Assault Cannon (space combat start check — run once when combat opens)
if 'Assault Cannon' IN player.technologies:
  nonFighterCount = count player's non-fighter ships in active system
  if nonFighterCount >= 3:
    // opponent must destroy 1 non-fighter ship
    open pending_action_window { type:'assault_cannon', eligible:[opponent.id],
      context:{ must_destroy:1, non_fighter_only:true } }

// Duranium Armor (after hits assigned each round)
if 'Duranium Armor' IN player.technologies:
  damagedNotSustaining = player's ships that are damaged AND did not use Sustain this round
  if damagedNotSustaining.length > 0:
    repair 1 (set damaged=false on one ship)

// Non-Euclidean Shielding (when Letnev unit uses Sustain Damage)
if 'Non-Euclidean Shielding' IN player.technologies AND player sustains this round:
  cancel 2 hits instead of 1 for each Sustain use
```

## Tests

```pseudocode
GIVEN Cruiser II owned EXPECT resolveUnitStats called; upgraded combat/dice used
GIVEN Assault Cannon owned AND 3+ non-fighter ships EXPECT window opened for opponent
GIVEN Assault Cannon owned AND <3 non-fighter ships EXPECT no window
GIVEN Duranium Armor owned AND damaged ship did not sustain EXPECT ship repaired
```
