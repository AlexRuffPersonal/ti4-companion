# fn-game-start-draft

**File:** `supabase/functions/game-start-draft/index.ts`
**Status:** New
**Prereqs:** migration-048-draft-state, shared-draftHelpers

## Functionality

```
CORS; AUTH; BODY(game_id, mode)
GAME(status, host_user_id, expansions, speaker, draft_state)
ERR(403) if userId !== game.host_user_id
ERR(409) if game.status !== 'lobby'
ERR(400) if mode not in ['official','milty']
ERR(409) if game.draft_state !== null

fetch players = game_players where game_id, order by seat_index
ERR(409) if players.length < 3

fetch tiles where type IN ('blue','red'); if !expansions.pok filter to expansion='base'

DEALT = { 3:{b:6,r:2}, 4:{b:5,r:3}, 5:{b:4,r:2,sr:1}, 6:{b:3,r:2}, 7:{b:4,r:2,sb:3,sr:2}, 8:{b:4,r:2,sb:2,sr:2} }
counts = DEALT[N] ?? DEALT[6]

// Rotate players so speaker is first
ordered = rotate players array so game.speaker is at index 0

if mode === 'official':
  shuffledBlue = shuffle(blue tiles); shuffledRed = shuffle(red tiles)
  for each player in ordered:
    b = counts.b + (isSpeaker ? counts.sb??0 : 0)
    r = counts.r + (isSpeaker ? counts.sr??0 : 0)
    hands[player.id] = next b blue + next r red tile_numbers
  placement_order = buildSnakeOrder(orderedIds, handSizes)
  draft_state = { mode:'official', phase:'placement', hands, placement_order, placement_index:0, placed_tiles:{} }

if mode === 'milty':
  N slices via balanceSlices(blueTiles, redTiles, N, counts.b, counts.r)
  // balanceSlices: sort by score desc, greedy assign each to lowest-score slice; retry up to 50x until max-min score <= 2
  pick_order = [...ordered].reverse().map(p=>p.id)  // reverse-speaker order
  draft_state = { mode:'milty', phase:'slice-pick', slices, pick_order, pick_index:0, hands:{}, placement_order:[], placement_index:0, placed_tiles:{} }

UPDATE games SET draft_state WHERE id=game_id
OK({ mode, phase, player_count:N })
```

## Tests

```
STD_MOCKS; T401; TCORS
T400(game_id); T400(mode); 400 invalid mode value
T404_GAME; T404_PLAYER
403 non-host; 409 not in lobby; 409 draft already active; 409 player count < 3

official 6P: 6 hands of 5 tiles each (3B+2R); placement_order length=30; phase='placement'
official 3P: 3 hands of 8 tiles each (6B+2R); placement_order length=24
official 5P: speaker hand length=7 (4B+3R), others length=6 (4B+2R)
milty 6P: 6 slices; each slice has 5 tiles (3B+2R); max_score-min_score <= 2; phase='slice-pick'
pok tiles excluded when expansions.pok=false
```
