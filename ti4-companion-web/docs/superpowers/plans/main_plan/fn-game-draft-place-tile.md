# fn-game-draft-place-tile

**File:** `supabase/functions/game-draft-place-tile/index.ts`
**Status:** New
**Prereqs:** fn-game-start-draft, shared-draftHelpers

## Functionality

```
CORS; AUTH; BODY(game_id, tile_number, position, rotation?)
GAME(draft_state)
ERR(404) if game not found
ds = game.draft_state; ERR(409) if !ds or ds.phase !== 'placement'
PLAYER (game_id + user_id); ERR(404) if missing
ERR(403) if player.id !== ds.placement_order[ds.placement_index]

hand = ds.hands[player.id] ?? []
ERR(400) if !hand.includes(tile_number)
ERR(400) if ds.placed_tiles[position] exists
ERR(400) if position === '0,0'
[q,r] = parse position; ERR(400) if NaN

// Ring constraint (weak validation)
targetRing = axialRing(q, r)
maxPlacedRing = max axialRing of placed_tiles keys (excluding '0,0'), default 0
ERR(400) if targetRing > maxPlacedRing + 1

// Adjacency validation
fetch tile from tiles where tile_number; ERR(404) if missing
neighbors = hexNeighbors(q, r)
anomalyAdjacentExists = tile.anomaly && any neighbor in placed_tiles has .anomaly
wormholeAdjacentExists = tile.wormhole && any neighbor in placed_tiles has .wormhole === tile.wormhole

if anomalyAdjacentExists && hand.length > 1: ERR(400, 'Cannot place adjacent anomalies')
if wormholeAdjacentExists && hand.length > 1: ERR(400, 'Cannot place adjacent same-type wormholes')
(if hand.length === 1: allow with warning in response)

// Apply placement
updatedHands[player.id] = hand.filter(t => t !== tile_number)
updatedPlacedTiles[position] = { tile_number, rotation: rotation??0, wormhole: tile.wormhole, anomaly: tile.anomaly }
newIndex = ds.placement_index + 1
isComplete = newIndex >= ds.placement_order.length

if isComplete:
  // Resolve tile_ids for all placed tiles in bulk
  fetch tiles where tile_number IN [all placed tile_numbers]
  build tileIdMap: tile_number → tile.id
  mapTiles = { '0,0': { tile_number:'18', tile_id: <mecatol id> } }
  for each [coord, placed] in updatedPlacedTiles:
    mapTiles[coord] = { tile_number: placed.tile_number, tile_id: tileIdMap[placed.tile_number], rotation: placed.rotation }
  UPDATE games SET draft_state=null, map_tiles=mapTiles WHERE id=game_id
  OK({ complete:true, warnings })
else:
  UPDATE games SET draft_state = { ...ds, hands:updatedHands, placed_tiles:updatedPlacedTiles, placement_index:newIndex }
  OK({ complete:false, next_player: placement_order[newIndex], warnings })
```

## Tests

```
STD_MOCKS; T401; TCORS
T400(game_id); T400(tile_number); T400(position)
T404_GAME; T404_PLAYER
409 draft not in placement phase
403 not the active placer
400 tile not in hand
400 position already occupied
400 position is '0,0'
400 ring skipped (targetRing > maxPlacedRing + 1)
400 anomaly-anomaly adjacency with hand.length > 1
400 same-wormhole adjacency with hand.length > 1
allowed with warning: anomaly adjacency when hand.length === 1

valid placement: tile removed from hand; placed_tiles updated; placement_index++; next_player correct
final tile: draft_state=null; map_tiles written with mecatol + all placed tiles; complete=true
```
