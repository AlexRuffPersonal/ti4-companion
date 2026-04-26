# fn-game-fire-space-cannon-defense

**File:** `supabase/functions/game-fire-space-cannon-defense/index.ts`
**Status:** New
**Prereqs:** fn-game-commit-ground-forces

## Functionality

```pseudocode
CORS AUTH BODY(game_id, combat_id) PLAYER COMBAT

if combat.combat_type !== 'ground': ERR('Not a ground combat', 409)
if combat.phase !== 'scd_fire': ERR('Combat is not in Space Cannon Defense phase', 409)
if player.id !== combat.defender_player_id: ERR('Only the defender can fire Space Cannon Defense', 409)

defUnits = query game_player_units
  WHERE game_id, system_key=combat.system_key, on_planet=combat.planet_name,
        player_id=combat.defender_player_id

defTypes = distinct unit_type from defUnits
scdDefs = query units WHERE name IN defTypes AND space_cannon IS NOT NULL
if scdDefs.length === 0: ERR('No Space Cannon units on this planet', 409)

defMap = Map(scdDefs by name)
results = [], hits = 0
for each unit in defUnits where defMap.has(unit.unit_type):
  ROLL_DICE([unit], defMap using space_cannon stat) → append to results, accumulate hits

nextPhase = hits > 0 ? 'scd_assign' : 'attacker_roll'

update game_combats SET scd_dice=results, scd_hits=hits, phase=nextPhase WHERE id=combat_id

OK({ scd_dice: results, scd_hits: hits })
```

Note: `ROLL_DICE` uses the `space_cannon` stat column. Use `parseStat` on the `space_cannon` value same as other stat columns.

## Tests

New file: `tests/functions/game-fire-space-cannon-defense.test.js`

```pseudocode
STD_MOCKS REQ(game_id, combat_id)
T401 T400(game_id) T400(combat_id) T404_PLAYER T404_COMBAT TCORS

T409('not a ground combat') — mock combat.combat_type='space'
T409('not in SCD phase') — mock combat.phase='attacker_roll'
T409('only defender can fire') — mock player.id=combat.attacker_player_id
T409('no space cannon units on planet') — mock scdDefs=[]

GIVEN defender has 1 PDS (space_cannon='6'), rolls [9] → 1 hit
  EXPECT game_combats.update called with { scd_hits: 1, phase: 'scd_assign' }
  EXPECT response { scd_hits: 1, scd_dice: [{value:9, hit:true}] }

GIVEN defender has 2 PDS, rolls [3, 4] → 0 hits
  EXPECT game_combats.update called with { scd_hits: 0, phase: 'attacker_roll' }
  EXPECT response { scd_hits: 0 }

GIVEN defender has mech with space_cannon AND PDS
  EXPECT both units contribute dice to scd roll
```
