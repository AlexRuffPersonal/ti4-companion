# fn-game-produce-units-p30

**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** fn-game-produce-units (p12), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Tech effects at production time

```pseudocode
// Before cost calculation:
effectiveCost = totalUnitCost

if 'Sarween Tools' IN player.technologies:
  effectiveCost = MAX(0, effectiveCost - 1)

if 'AI Development Algorithm' IN player.technologies AND player.exhausted contains 'AI Development Algorithm':
  upgradeCount = count of unit_upgrade techs in player.technologies
  effectiveCost = MAX(0, effectiveCost - upgradeCount)
  // (player must have explicitly exhausted it via game-exhaust-technology first)

if 'Hegemonic Trade Policy' IN player.technologies AND player.exhausted contains 'Hegemonic Trade Policy':
  // swap resource/influence of selected planet for this turn — apply to planet row in-memory
  swappedPlanet = selections.hegemonic_planet
  // planet resource and influence are swapped when summing available resources

if 'Mirror Computing' IN player.technologies:
  // each TG spent is worth 2 resources; factor into resource check

// After production resolves:
if 'Yin Spinner' IN player.technologies:
  // place 1 infantry on a controlled planet in that system
  planetName = selections.yin_spinner_planet
  upsert game_player_units { unit_type:'infantry', on_planet:planetName, count:1 }

if 'Self-Assembly Routines' IN player.technologies AND NOT exhausted:
  // offer to exhaust to place 1 mech (client sends exhaust flag in selections)
  if selections.self_assembly_exhaust:
    planetName = selections.self_assembly_planet
    upsert game_player_units { unit_type:'mech', on_planet:planetName, count:1 }
    UPDATE game_players SET exhausted_technologies = array_append(...)

if 'Magmus Reactor' IN player.technologies:
  // check system has war sun or is adjacent to supernova
  if systemHasWarSun OR adjacentToSupernova:
    UPDATE game_players SET trade_goods += 1

if 'Aerie Hololattice' IN player.technologies:
  // planets with structures grant +1 production capacity
  // apply when computing max production for the system
```

## Tests

```pseudocode
GIVEN Sarween Tools owned EXPECT cost reduced by 1 (min 0)
GIVEN AI Development Algorithm exhausted, 3 unit upgrades owned EXPECT cost reduced by 3
GIVEN Yin Spinner owned EXPECT infantry placed on selections.yin_spinner_planet after production
GIVEN Magmus Reactor owned, system has war sun EXPECT trade_goods += 1
```
