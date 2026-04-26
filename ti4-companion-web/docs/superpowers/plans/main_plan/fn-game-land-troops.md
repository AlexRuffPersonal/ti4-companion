# fn-game-land-troops

**File:** `supabase/functions/game-land-troops/index.ts`
**Status:** Modify
**Prereqs:** migration-028-ground-combat

## Changes

Insert before the existing planet upsert:

```pseudocode
CORS AUTH BODY(game_id, system_key, planet_name, troop_count≥1) PLAYER GAME(round,map_tiles,custodians_claimed)

verify system activated by caller this round
verify planet exists in tile

defenders = query game_player_units
  WHERE game_id, system_key, on_planet=planet_name, player_id != caller

insert/upsert attacker infantry on planet (unchanged)

IF defenders.length > 0:
  insert game_combats {combat_type:'ground', planet_name, attacker=caller, defender=defenders[0].player_id, phase:'attacker_roll'}
  OK({ combat_id })
ELSE:
  CLAIM_PLANET(...)
  CUSTODIANS(...)
  OK({ claimed:true, custodians_claimed?:true })   ← unchanged path
```

## Tests

Extend `tests/functions/game-land-troops.test.js`. Add `game_combats` insert mock + `defenderUnits` option to `mockDb`.

```pseudocode
STD_MOCKS REQ(game_id, system_key, planet_name, troop_count)
T401 T400(game_id) T400(planet_name) T400(troop_count=0) T404_PLAYER TCORS
// existing cases stay unchanged (regression)

T409('system not activated')
T409('planet not in tile')

// new cases:
GIVEN defenderUnits=[{player_id:'enemy'}]
  EXPECT game_combats.insert called with combat_type='ground', planet_name, attacker=PLAYER_ID, defender='enemy'
  EXPECT game_player_planets.upsert NOT called
  EXPECT response { combat_id: string }

GIVEN defenderUnits=[] (uncontested)
  EXPECT game_player_planets.upsert called     ← regression
  EXPECT response { claimed:true }

GIVEN system_key='0,0', custodians_claimed=false, defenderUnits=[]
  EXPECT custodians awarded                    ← regression

GIVEN system_key='0,0', defenderUnits=[…]
  EXPECT custodians NOT awarded (deferred to game-assign-ground-hits)
```
