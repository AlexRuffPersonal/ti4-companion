# fn-game-produce-units

**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** New
**Prereqs:** migration-029-strategy-production

## Functionality

```pseudocode
CORS AUTH BODY(game_id, system_key, units[{unit_type,count,on_planet?}], planet_exhausts[]) PLAYER GAME(id,phase,active_player_id,round,map_tiles)

ACTIVE_PLAYER
ERR 409 if game.phase !== 'action'
ACTIVATION(system_key)

// Compute production capacity from all caller units in system
callerUnits = query game_player_units WHERE game_id AND system_key AND player_id=caller
unitDefs = fetch units WHERE name IN callerUnits[].unit_type
totalCapacity = sum of PARSE_STAT(def.production) for each unit where production not null
ERR 409 if totalCapacity === 0 ('No production-capable units in system')

totalToProduce = sum(units[].count)
ERR 409 if totalToProduce > totalCapacity ('Exceeds production capacity')

// Validate resource payment
exhaustPlanets = query game_player_planets WHERE game_id AND player_id=caller AND planet_name IN planet_exhausts
ERR 409 if any planet not found or not owned by caller
TILE_ID(system_key, game)
TILE(tileId)
totalResources = sum of planet.resources from tile.planets JSONB for each exhausted planet
unitCosts = fetch units WHERE name IN units[].unit_type
totalCost = sum(unitDef.cost * unit.count)
ERR 409 if totalResources < totalCost ('Insufficient resources')

// Validate no ships produced in enemy-occupied system
shipTypes = unitDefs where unit is not ground force (planetary=false)
IF any ship being produced:
  enemyShips = query game_player_units WHERE game_id AND system_key AND player_id != caller
  ERR 409 if enemyShips.length > 0 ('Cannot produce ships in enemy-occupied system')

// Validate ground forces have on_planet specified
groundTypes = unitDefs where planetary=true
FOR each unit in units[] where unit_type is ground:
  ERR 409 if on_planet missing or null

// Exhaust payment planets
update game_player_planets SET exhausted=true WHERE game_id AND player_id=caller AND planet_name IN planet_exhausts

// Place produced units
FOR each unit in units[]:
  upsert game_player_units { game_id, player_id:caller, system_key, unit_type, on_planet }
    on conflict (game_id, player_id, system_key, unit_type, on_planet): increment count

OK({ produced: true })
```

## Tests

```pseudocode
STD_MOCKS REQ(game_id, system_key, units:[{unit_type:'Carrier',count:1}], planet_exhausts:['Mecatol Rex'])
T401 T400(game_id) T400(system_key) T400(units) T404_PLAYER TCORS
T409_ACTIVE T409_ACTIVATED

T409('no production-capable units in system') — mock callerUnits with no production stat
T409('exceeds production capacity') — mock totalCapacity=1, request 3 units
T409('insufficient resources') — mock planet resources < unit cost
T409('cannot produce ships in enemy-occupied system') — mock enemy units in system
T409('ground force missing on_planet') — request infantry without on_planet

GIVEN valid production request:
  EXPECT payment planets exhausted
  EXPECT units upserted into game_player_units
  EXPECT response { produced: true }

GIVEN unit row already exists (count increment):
  EXPECT count incremented, not duplicate row inserted
```
