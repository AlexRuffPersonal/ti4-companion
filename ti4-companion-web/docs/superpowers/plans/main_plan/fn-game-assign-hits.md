# fn-game-assign-hits

**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** migration-031-invasion

## Changes

Extend the existing phase dispatch to handle four new phases. The existing `attacker_assign` / `defender_assign` cases for space and ground combat remain unchanged.

Also absorbs the Phase 11 `game-assign-ground-hits` spec — ground combat assignment (`attacker_assign` / `defender_assign` on `combat_type='ground'`) is handled here instead of a separate function. `game-assign-ground-hits` is not implemented.

### Phase routing (new cases only)

| phase | combat_type | who acts | hits field | valid units | next phase |
|---|---|---|---|---|---|
| `afb_attacker_assign` | `space` | attacker | `barrage_defender_hits` | fighters in space area | `afb_defender_assign` or `attacker_roll` if `barrage_attacker_hits=0` |
| `afb_defender_assign` | `space` | defender | `barrage_attacker_hits` | fighters in space area | `attacker_roll` |
| `bombardment_assign` | `bombardment` | defender | `attacker_hits` | ground forces on planet | `complete` |
| `scd_assign` | `ground` | attacker | `scd_hits` | ground forces on planet | `attacker_roll` |

### New pseudocode (add to phase dispatch block)

```pseudocode
case 'afb_attacker_assign':
  if player.id !== combat.attacker_player_id: ERR('Not the attacker', 409)
  hitsToAssign = combat.barrage_defender_hits
  targetUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
    player_id=combat.attacker_player_id, on_planet IS NULL, unit_type='fighter'
  validate: casualties only contain unit_type='fighter'; else ERR('AFB hits must target fighters', 409)
  validate: sum(casualties.count) === min(hitsToAssign, totalFighterCount)
  APPLY_CASUALTIES(casualties, targetUnits, defMap)
  nextPhase = combat.barrage_attacker_hits > 0 ? 'afb_defender_assign' : 'attacker_roll'
  update game_combats SET phase=nextPhase WHERE id=combat_id
  break

case 'afb_defender_assign':
  if player.id !== combat.defender_player_id: ERR('Not the defender', 409)
  hitsToAssign = combat.barrage_attacker_hits
  targetUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
    player_id=combat.defender_player_id, on_planet IS NULL, unit_type='fighter'
  validate: casualties only contain unit_type='fighter'; else ERR('AFB hits must target fighters', 409)
  validate: sum(casualties.count) === min(hitsToAssign, totalFighterCount)
  APPLY_CASUALTIES(casualties, targetUnits, defMap)
  update game_combats SET phase='attacker_roll' WHERE id=combat_id
  break

case 'bombardment_assign':
  if player.id !== combat.defender_player_id: ERR('Not the defender', 409)
  hitsToAssign = combat.attacker_hits
  targetUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
    on_planet=combat.planet_name, player_id=combat.defender_player_id
  validate: sum(casualties.count) === min(hitsToAssign, totalGroundForceCount)
  groundDefs = query units WHERE name IN (distinct unit_type from targetUnits)
  APPLY_CASUALTIES(casualties, targetUnits, Map(groundDefs by name))
  update game_combats SET phase='complete' WHERE id=combat_id
  break

case 'scd_assign':
  if player.id !== combat.attacker_player_id: ERR('Not the attacker', 409)
  hitsToAssign = combat.scd_hits
  targetUnits = query game_player_units WHERE game_id, system_key=combat.system_key,
    on_planet=combat.planet_name, player_id=combat.attacker_player_id
  validate: sum(casualties.count) === min(hitsToAssign, totalGroundForceCount)
  groundDefs = query units WHERE name IN (distinct unit_type from targetUnits)
  APPLY_CASUALTIES(casualties, targetUnits, Map(groundDefs by name))
  update game_combats SET phase='attacker_roll' WHERE id=combat_id
  break
```

### Ground combat assign (also add if not already present)

```pseudocode
// If combat_type='ground' and phase='attacker_assign' or 'defender_assign':
// Same logic as space combat assign but queries on_planet=combat.planet_name units
// Handled by parameterising the existing space combat assign block on combat_type
```

## Tests

Extend `tests/functions/game-assign-hits.test.js`

```pseudocode
// afb_attacker_assign
GIVEN phase='afb_attacker_assign', barrage_defender_hits=2, attacker has 3 fighters in space
  casualties=[{unit_type:'fighter', count:2}]
  EXPECT 2 fighters removed from attacker in space area
  EXPECT game_combats.update phase='afb_defender_assign'  // barrage_attacker_hits > 0

GIVEN phase='afb_attacker_assign', barrage_defender_hits=1, barrage_attacker_hits=0
  EXPECT phase updated to 'attacker_roll' (skip afb_defender_assign)

T409('not the attacker') — caller=defender on afb_attacker_assign
T409('AFB hits must target fighters') — casualties=[{unit_type:'cruiser', count:1}]

// afb_defender_assign
GIVEN phase='afb_defender_assign', barrage_attacker_hits=1, defender has 2 fighters
  casualties=[{unit_type:'fighter', count:1}]
  EXPECT 1 fighter removed from defender
  EXPECT phase='attacker_roll'

T409('not the defender') — caller=attacker on afb_defender_assign

// bombardment_assign
GIVEN phase='bombardment_assign', attacker_hits=2, defender has 3 infantry + 1 mech on planet
  casualties=[{unit_type:'infantry', count:2}]
  EXPECT 2 infantry removed from planet
  EXPECT phase='complete'

GIVEN hits > available units (attacker_hits=5, only 2 infantry)
  casualties=[{unit_type:'infantry', count:2}]  // min(5,2)=2 required
  EXPECT 2 infantry removed, phase='complete'

T409('not the defender') — caller=attacker on bombardment_assign

// scd_assign
GIVEN phase='scd_assign', scd_hits=1, attacker has 2 infantry on planet
  casualties=[{unit_type:'infantry', count:1}]
  EXPECT 1 infantry removed from attacker on planet
  EXPECT phase='attacker_roll'

T409('not the attacker') — caller=defender on scd_assign
```
