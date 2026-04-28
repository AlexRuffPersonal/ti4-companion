# fn-game-assign-hits

**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** migration-031-invasion, migration-036-combat-action-cards

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

### Phase 20 Changes

Before processing any casualties, read `shields_holding_{side}` from `pending_effects` and reduce the hit count by that amount (minimum 0). Clear that key from `pending_effects` before continuing.

Forced hits from Courageous To The End arrive with `sustain_allowed: false` in the request body. Reject any `sustain` assignment for those hits: ERR('Sustain not allowed for forced hits', 409).

After processing the full casualties list:
- Each `sustain` action: append `{player_id, unit_id, unit_type}` to `combat.sustained_this_phase`
- Each `destroy` action: append `{player_id, unit_id, unit_type, combat_value}` to `combat.destroyed_this_phase`

After processing:
```pseudocode
if combat.sustained_this_phase non-empty:
  UPDATE game_combats SET phase='window_post_sustain'
else if combat.destroyed_this_phase non-empty:
  UPDATE game_combats SET phase='window_post_destroy'
else:
  advance to next main phase as before
```

```pseudocode
// Phase 20 tests (extend existing test file)

GIVEN shields_holding_defender=2 in pending_effects, attacker_hits=3
  EXPECT effective hits = 1 (3-2); player assigns 1 casualty
  EXPECT shields_holding_defender cleared from pending_effects

GIVEN sustain chosen, unit_id='u1', unit_type='dreadnought'
  EXPECT sustained_this_phase=[{player_id, unit_id:'u1', unit_type:'dreadnought'}]
  EXPECT phase='window_post_sustain'

GIVEN destroy chosen AND no sustains
  EXPECT destroyed_this_phase=[{..., combat_value:5}]
  EXPECT phase='window_post_destroy'

GIVEN forced hit with sustain_allowed=false, player chooses sustain
  EXPECT 409
```
