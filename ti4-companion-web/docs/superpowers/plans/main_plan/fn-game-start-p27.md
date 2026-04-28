# fn-game-start-p27
**File:** `supabase/functions/game-start/index.ts`
**Status:** Modify
**Prereqs:** —

## Changes

Replace the two per-player loops (starting techs + home planets, then home tile numbers) with batched reads and parallel writes. No behaviour change.

```pseudocode
// After players array is validated, replace lines 249–338 with:

// 1. Batch faction query (replaces per-player faction queries in both loops)
factionRows = await db.from('factions')
  .select('name, home_tile_number, starting_techs')
  .in('name', players.map(p => p.faction))
factionMap = Map<name → factionRow>

// Validate all factions found
for player of players:
  if !factionMap.has(player.faction): ERR('Faction not found for player "{player.display_name}"', 409)

// 2. Batch tile query
homeTileNumbers = unique non-null home_tile_number values from factionMap
tileRows = await db.from('tiles')
  .select('tile_number, planets')
  .in('tile_number', homeTileNumbers)
tileMap = Map<tile_number → tileRow>

// 3. Build all planet rows in memory
allPlanetRows = []
for player of players:
  faction = factionMap.get(player.faction)
  tile = tileMap.get(faction.home_tile_number)
  for planet of (tile?.planets ?? []):
    allPlanetRows.push({ game_id, player_id: player.id, planet_name, exhausted: false,
                         tech_specialty, influence, resources })

// 4. Single bulk planet insert
if allPlanetRows.length > 0:
  await db.from('game_player_planets').insert(allPlanetRows)

// 5. Concurrent tech updates
techUpdates = players
  .filter(p => factionMap.get(p.faction).starting_techs?.length > 0)
  .map(p => db.from('game_players')
    .update({ technologies: factionMap.get(p.faction).starting_techs })
    .eq('id', p.id))
await Promise.all(techUpdates)

// 6. Seed map_tiles (replaces duplicate faction loop at old lines 323–329)
// homeTileNumbers already built above; tileByNumber map already built from allTiles query
for i, player of players:
  homeTileNumber = String(factionMap.get(player.faction).home_tile_number ?? '')
  homeTileId = tileByNumber.get(homeTileNumber)
  if homeTileId: mapTiles[HOME_POSITIONS[i]] = { tile_id: homeTileId, tile_number: homeTileNumber }
```

The `allTiles` query and `tileByNumber` map (used for seeding `map_tiles`) remain unchanged.

## Tests

```pseudocode
STD_MOCKS (existing game-start mocks)

it('existing happy-path tests pass unchanged')

it('db.from called exactly once with "factions"')
  spy on db.from; run handler with 8-player game
  expect calls to db.from('factions') to equal 1

it('all players receive correct starting techs and home planets via batch path')
  mock factionRows for 2 players with distinct starting_techs
  mock tileRows for their home tiles
  expect game_player_planets insert called once with all rows
  expect Promise.all tech updates fire for each player with techs
```
