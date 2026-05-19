# fn-game-explore-planet-p39
**File:** `supabase/functions/game-explore-planet/index.ts`
**Status:** Modify
**Prereqs:** fn-game-explore-planet, migration-051-exploration-fixes

## Functionality
One change: store `system_key` on the drawn card row so game-resolve-exploration-card can use it later.

```pseudocode
// After drawing the top card and before the existing planet explored=true update:

// Derive system_key from game.map_tiles using planet.tile_id
mapTiles = game.map_tiles as Record<string, { tile_id: string }>
systemKey = Object.entries(mapTiles).find(([, v]) => v.tile_id === planet.tile_id)?.[0] ?? null

// Include system_key in the state='drawn' update
update game_exploration_decks SET
  state='drawn',
  resolved_by_player_id=player_id,
  planet_name=planet_name,
  system_key=systemKey
WHERE id=card.id
```

Note: the existing code already sets `planet_name` in the response body but not in the DB row update. This change also persists `planet_name` on the row for completeness.

## Tests
```pseudocode
it('stores system_key on the drawn card row')
  game.map_tiles = { '2,1': { tile_id: planet.tile_id } }
  → drawn card update includes system_key='2,1'

it('stores null system_key when planet tile not found in map')
  game.map_tiles = {}
  → drawn card update includes system_key=null
```
