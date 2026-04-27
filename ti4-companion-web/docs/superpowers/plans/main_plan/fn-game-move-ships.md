# fn-game-move-ships
**File:** `supabase/functions/game-move-ships/index.ts`
**Status:** New
**Prereqs:** —

## Functionality

```
CORS; AUTH; BODY(game_id, active_system_key, ships[])
PLAYER(id); GAME(id, active_player_id, round, map_tiles)
ACTIVE_PLAYER

// Bulk fetch all data needed for validation
fetch game_player_units where game_id, on_planet IS NULL → allSpaceUnits
fetch game_system_activations where game_id, player_id, round → myTokenSystems (set of system_keys)
collect all system_keys from ships[].path across all ships
fetch tiles where id IN (tile_ids for those systems) → tileMap { system_key → { anomalies[], wormholes[] } }
fetch units where unit_type IN (ships[].unit_type) → unitDefs { unit_type → { move, capacity } }

// Build adjacency helper: axial neighbours + wormhole connections (shared wormhole type)
// Build enemy-presence set: system_keys where allSpaceUnits has rows with player_id !== player.id

for each ship in ships:
  def = unitDefs[ship.unit_type]; ERR 400 if missing
  verify player owns ≥ 1 of ship.unit_type at ship.origin_system_key in allSpaceUnits; ERR 409 if not
  ERR 409 if origin has myToken && origin !== active_system_key
  if origin tile anomalies includes 'nebula': cap move = 1 else move = def.move
  gravityBonus = 0
  for each hop in ship.path (skip index 0 = origin):
    ERR 409 if hop not adjacent to previous (axial or wormhole)
    tileAnoms = tileMap[hop].anomalies
    ERR 409 if tileAnoms includes 'asteroid_field' or 'supernova'
    if hop is not last: ERR 409 if tileAnoms includes 'nebula'
    if prev tile anomalies includes 'gravity_rift': gravityBonus += 1
    if hop is not last: ERR 409 if hop in enemyPresence
  ERR 409 if (path.length - 1) > move + gravityBonus
  ERR 409 if ship.path[last] !== active_system_key

  totalCargo = 0
  for each cargo in ship.cargo:
    ERR 400 if cargo.unit_type not in ['fighter','infantry']
    ERR 409 if cargo.system_key not in ship.path
    ERR 409 if cargo.system_key in myTokenSystems && cargo.system_key !== active_system_key
    verify player owns ≥ cargo.count of cargo.unit_type at cargo.system_key; ERR 409 if not
    totalCargo += cargo.count
  ERR 409 if totalCargo > def.capacity

// Post-movement capacity enforcement
compute originCapacityBySystem: for each origin, sum capacity of ships NOT in this move declaration
compute activeSysCapacity: sum capacity of ALL ships that will be in active system after move
compute originFightersInfantry: fighters+infantry remaining in each origin after cargo departs
compute activeFightersInfantry: all fighters+infantry in active system after move + incoming cargo

verify excess_removals exactly resolves any over-capacity in each origin and active system
ERR 409 'Excess removals insufficient' if any system still over-capacity after applying removals

// Write pass
for each ship: update game_player_units row system_key → active_system_key
for each cargo entry: decrement source row count; upsert into active system row
for each excess_removal: decrement row count; delete row if count reaches 0

OK({ moved: true, units_removed: excess_removals })
```

## Tests

```
STD_MOCKS
T401; TCORS; T400(game_id); T400(active_system_key); T400(ships)
T404_PLAYER; T409_ACTIVE

happy: carrier at "0,1" moves to "1,1" (adjacent, no cargo) → ship row system_key updated
happy: carrier picks up 2 infantry from "0,1" and 1 fighter from "1,1" along path → units moved
T409: origin has player command token (not active system) → rejected
T409: path length > move value → rejected
T409: hop not axially adjacent → rejected
T409: hop passes through enemy-occupied system → rejected
T409: hop enters asteroid field → rejected
T409: hop enters supernova → rejected
T409: hop passes through nebula (not final) → rejected
T409: origin is nebula, path length > 1 → rejected (move capped to 1)
happy: gravity rift on path → +1 move applied; ship can reach one system further
T409: cargo count > ship capacity → rejected
T409: cargo pickup from system with player command token (not active) → rejected
T409: cargo unit_type is 'carrier' → rejected
T409: excess_removals insufficient to resolve origin over-capacity → rejected
T409: excess_removals insufficient to resolve active system over-capacity → rejected
happy: excess_removals fully applied → zeroed rows deleted
```
