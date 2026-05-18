# fn-game-draft-pick-slice

**File:** `supabase/functions/game-draft-pick-slice/index.ts`
**Status:** New
**Prereqs:** fn-game-start-draft, shared-draftHelpers

## Functionality

```
CORS; AUTH; BODY(game_id, slice_id)
GAME(draft_state)
ERR(404) if game not found
ds = game.draft_state; ERR(409) if !ds or ds.phase !== 'slice-pick'
PLAYER (game_id + user_id); ERR(404) if missing
ERR(403) if player.id !== ds.pick_order[ds.pick_index]
slice = ds.slices.find(s => s.id === slice_id); ERR(404) if missing
ERR(409) if slice.claimed_by !== null

// Claim slice
updatedSlices = slices with slice.claimed_by = player.id
updatedHands[player.id] = slice.tiles
newPickIndex = ds.pick_index + 1

if newPickIndex >= ds.pick_order.length:
  // All slices claimed — transition to placement
  allHandSizes = {player_id: tiles.length} for each claimed hand
  playerOrder = [...ds.pick_order].reverse()  // reverse of reverse-speaker = speaker order
  placement_order = buildSnakeOrder(playerOrder, allHandSizes)
  newPhase = 'placement'
else:
  newPhase = 'slice-pick'

UPDATE games SET draft_state = { ...ds, slices:updatedSlices, hands:updatedHands,
  pick_index:newPickIndex, phase:newPhase, placement_order }
OK({ phase: newPhase })
```

## Tests

```
STD_MOCKS; T401; TCORS
T400(game_id); T400(slice_id)
T404_GAME; T404_PLAYER
409 draft not in slice-pick phase
403 not the active picker
404 slice_id not found
409 slice already claimed

valid pick: slice.claimed_by set; tiles moved to hands; pick_index++
last pick: phase→'placement'; placement_order populated with correct snake; hands all populated
```
