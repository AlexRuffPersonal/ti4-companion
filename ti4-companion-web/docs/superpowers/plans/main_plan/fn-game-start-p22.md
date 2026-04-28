# fn-game-start (Phase 22)

**File:** `supabase/functions/game-start/index.ts`
**Status:** Modify
**Prereqs:** fn-game-update-settings-p22

## Changes

```ts
// Import HOME_POSITIONS_BY_COUNT lookup (defined in this file, mirrors mapParser.js):
const HOME_POSITIONS_BY_COUNT: Record<number, string[]> = {
  3: ['3,-3', '-3,3', '0,-3'],
  4: ['3,-3', '3,0', '-3,3', '0,-3'],
  5: ['3,-3', '3,0', '0,3', '-3,3', '0,-3'],
  6: ['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3'],  // existing HOME_POSITIONS
  7: [...],
  8: [...],
}

// Replace current map seeding block:

// Extend GAME() select to include map_layout and map_tiles:
GAME('..., map_layout, map_tiles')

const playerCount = players.length
const homePositions = HOME_POSITIONS_BY_COUNT[playerCount]
if (!homePositions) return ERR(`Unsupported player count: ${playerCount}`, 409)

let mapTiles: Record<string, { tile_id: string; tile_number: string; rotation?: number }>

if (game.map_layout === 'standard-6' || Object.keys(game.map_tiles ?? {}).length === 0) {
  // Existing hardcoded seeding path (unchanged logic)
  mapTiles = buildHardcodedStandardMap(tileByNumber)  // existing INNER_TILE_NUMBERS / INNER_POSITIONS logic
} else {
  // Custom map path: use stored map_tiles as non-home base
  mapTiles = { ...(game.map_tiles as typeof mapTiles) }
  // Remove any stale home positions (in case player count changed)
  for (const pos of Object.values(HOME_POSITIONS_BY_COUNT).flat()) delete mapTiles[pos]
}

// Place home tiles at player-count-appropriate positions (both paths):
for (let i = 0; i < players.length && i < homePositions.length; i++) {
  const homeTileNumber = homeTileNumbers[i]
  const homeTileId = homeTileNumber ? tileByNumber.get(homeTileNumber) : undefined
  if (homeTileId && homeTileNumber) {
    mapTiles[homePositions[i]] = { tile_id: homeTileId, tile_number: homeTileNumber }
  }
}

// Write map_tiles (unchanged):
UPDATE games SET map_tiles = mapTiles WHERE id = game_id
```

## Tests

```js
STD_MOCKS
// custom map_layout ('custom-6') + populated map_tiles → stored map_tiles used as base;
//   homes added at HOME_POSITIONS_BY_COUNT[6] positions
// map_layout 'standard-6' → existing hardcoded INNER_TILE_NUMBERS seeding runs
// non-standard map_layout + empty map_tiles → falls back to hardcoded standard seeding
// player count 4 with custom map → homes at HOME_POSITIONS_BY_COUNT[4]
// player count not in HOME_POSITIONS_BY_COUNT → 409 before any DB writes
```
