# fn-game-fire-bombardment

**File:** `supabase/functions/game-fire-bombardment/index.ts`
**Status:** New
**Prereqs:** migration-031-invasion

## Functionality

```pseudocode
CORS AUTH BODY(game_id, system_key, planet_name) PLAYER GAME(round, map_tiles)

ACTIVATION(system_key)
TILE_ID(system_key, game) → tileId
TILE(tileId)
PLANET_EXISTS(planet_name, tile)

// Must not have already filed a bombardment row for this planet
existing = query game_combats WHERE game_id, system_key, combat_type='bombardment', planet_name
if existing: ERR('Planet already bombarded this invasion', 409)

// Need defender ground forces to bombard
defenderUnits = query game_player_units
  WHERE game_id, system_key, on_planet=planet_name, player_id != player.id
if defenderUnits.length === 0: ERR('No ground forces to bombard on this planet', 409)

// Planetary Shield check
defTypes = distinct unit_type from defenderUnits
shieldDefs = query units WHERE name IN defTypes AND planetary_shield=true

if shieldDefs.length > 0:
  // War Suns negate Planetary Shield
  atkSpaceUnits = query game_player_units
    WHERE game_id, system_key, player_id=player.id, on_planet IS NULL
  atkTypes = distinct unit_type from atkSpaceUnits
  warSunDefs = query units WHERE name IN atkTypes AND unit_type='war_sun'
  if warSunDefs.length === 0: ERR('Planetary Shield is active — cannot bombard', 409)

// Roll bombardment dice (may query atkSpaceUnits already fetched above; re-query if needed)
atkSpaceUnits = query game_player_units
  WHERE game_id, system_key, player_id=player.id, on_planet IS NULL
atkTypes = distinct unit_type from atkSpaceUnits
bombDefs = query units WHERE name IN atkTypes AND bombardment IS NOT NULL
if bombDefs.length === 0: ERR('No units with Bombardment ability in space area', 409)

defMap = Map(bombDefs by name)  // keyed by unit_type, value = unit def row
results = [], hits = 0
for each unit in atkSpaceUnits where defMap.has(unit.unit_type):
  ROLL_DICE([unit], defMap using bombardment stat) → append to results, accumulate hits

defenderId = defenderUnits[0].player_id
phase = hits > 0 ? 'bombardment_assign' : 'complete'

insert game_combats {
  game_id,
  system_key,
  combat_type: 'bombardment',
  planet_name,
  attacker_player_id: player.id,
  defender_player_id: defenderId,
  phase,
  attacker_dice: results,
  attacker_hits: hits,
  round: game.round
}

OK({ combat_id: <inserted id>, dice: results, hits })
```

Note: `ROLL_DICE` uses the `bombardment` stat column, not `combat`. Use `parseStat` on the `bombardment` column value same way AFB uses the `afb` column.

## Tests

New file: `tests/functions/game-fire-bombardment.test.js`

```pseudocode
STD_MOCKS REQ(game_id, system_key, planet_name)
T401 T400(game_id) T400(system_key) T400(planet_name) T404_PLAYER TCORS
T409_ACTIVATED
T409('planet not found in system')
T409('planet already bombarded') — mock existing bombardment row for planet
T409('no ground forces to bombard') — mock defenderUnits=[]
T409('planetary shield active') — mock shieldDefs=[{name:'pds'}], no war sun attacker
T409('no bombardment units') — mock bombDefs=[]

GIVEN 2 dreadnoughts (bombardment='5'), defender has 3 infantry, no planetary shield
  mock rolls: [8,3] → 1 hit
  EXPECT game_combats.insert called with {
    combat_type: 'bombardment', planet_name, attacker_hits: 1, phase: 'bombardment_assign'
  }
  EXPECT response { hits: 1, dice: [...] }

GIVEN planetary shield present AND attacker has war sun
  EXPECT shield check passes (war sun present)
  EXPECT proceeds to roll bombardment

GIVEN rolls all miss (hits=0)
  EXPECT game_combats.insert with phase='complete'
  EXPECT response { hits: 0 }

GIVEN defender has war sun (planetary_shield=false on war_sun def)
  EXPECT no planetary shield triggered (shield only from units that have planetary_shield=true)
```
