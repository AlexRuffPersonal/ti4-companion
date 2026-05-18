# In-App Map Draft — Design Spec

**Date:** 2026-05-18
**Phase:** 39 (proposed)
**Prereq:** Phase 22 (Map Builder) — done

---

## Overview

An interactive lobby-phase feature that lets players build the galaxy map collaboratively, without leaving the app. Two modes are supported: **Official** (tiles randomly dealt per LRR rules, placed in speaker snake order) and **Milty** (app generates balanced slices, players pick in reverse-speaker order, then place in snake order). The result populates `games.map_tiles` exactly as the existing map string builder does. Both modes coexist — the host chooses between "Paste Map String" and "In-App Draft" in the lobby.

---

## Rules Basis

From LRR **Complete Setup — Step 6**:

- **6.ii DEAL SYSTEM TILES:** Shuffle blue and red tiles into separate facedown piles. Deal facedown to each player per player count (e.g. 6P → 3 blue + 2 red each).
- **6.iii PLACE SYSTEM TILES:** Starting with the speaker and proceeding clockwise, each player places one tile faceup in ring 1. After the last player places their first tile, they place a second (starting the return). Order reverses counterclockwise until it reaches the speaker, who places two. This snake repeats until all tiles are placed.
- Rings must be completed before any tile enters the next ring.
- Anomaly tiles cannot be adjacent to each other (unless no other option).
- System tiles with the same wormhole type cannot be adjacent (unless no other option).

The Milty variant is a popular community extension: balanced "slices" are drafted before placement rather than random dealing.

---

## Data Model

### Migration: `048_draft_state.sql`

```sql
ALTER TABLE games ADD COLUMN draft_state JSONB;
```

`draft_state` is `null` when no draft is active. When set, it holds the full draft state. The existing Realtime subscription on `games` in `useGame.js` broadcasts all changes to every player automatically — no new subscription code required.

### `draft_state` shape

```typescript
{
  mode: 'official' | 'milty',
  phase: 'slice-pick' | 'placement' | 'complete',

  // Milty only
  slices?: Array<{
    id: number,
    tiles: string[],          // tile_numbers
    claimed_by: string | null, // player_id
    score: number,
  }>,
  pick_order?: string[],  // player_ids in reverse-speaker order
  pick_index?: number,

  // Each player's remaining tiles
  hands: Record<string, string[]>,  // player_id → tile_numbers

  // Pre-computed full snake sequence (e.g. [A,B,C,C,B,A,A,B,...])
  placement_order: string[],
  placement_index: number,

  // Tiles placed so far; merged into map_tiles on completion
  placed_tiles: Record<string, { tile_number: string, rotation?: number }>
}
```

The `placement_order` array is the fully-expanded snake sequence computed once at draft start. Advancing the draft is `placement_index++`. Draft completes when `placement_index >= placement_order.length`.

---

## Balance Algorithm (Milty mode)

1. Fetch all non-home, non-Mecatol tiles from the `tiles` DB table, filtered by expansion settings.
2. Separate into blue-backed and red-backed pools matching the LRR dealt counts for the player count.
3. Score each tile: `score = resources + influence + (has_wormhole ? 1 : 0) − (is_anomaly ? 1 : 0)`.
4. Sort tiles by score descending. Use a greedy pass: assign each tile to the slice with the lowest current total score.
5. Accept if max slice score − min slice score ≤ 2. Otherwise shuffle and retry (up to 50 attempts).

---

## Edge Functions

### `game-start-draft`

- **Auth:** host only
- **Input:** `{ game_id, mode: 'official' | 'milty' }`
- **Official:** shuffle blue/red separately; deal per LRR counts; compute full snake `placement_order`; set `phase: 'placement'`
- **Milty:** run balance algorithm to produce N slices; set `pick_order` (reverse speaker order); set `phase: 'slice-pick'`; `placement_order` and `hands` left empty until all slices are claimed
- **Writes** `draft_state` to `games`

### `game-draft-pick-slice` (Milty only)

- **Auth:** any player; validates `player_id === pick_order[pick_index]`
- **Input:** `{ game_id, slice_id }`
- **Rejects:** caller not the active picker; slice already claimed
- **On success:** sets `slices[slice_id].claimed_by = player_id`; moves tiles into `hands[player_id]`; increments `pick_index`
- **When all slices claimed:** computes snake `placement_order` from current player order; transitions `phase → 'placement'`

### `game-draft-place-tile`

- **Auth:** any player; validates `player_id === placement_order[placement_index]`
- **Input:** `{ game_id, tile_number, position: 'q,r', rotation?: number }`
- **Validates:**
  - Tile is in caller's hand
  - Position is empty in `placed_tiles`
  - Position is in the correct ring (current ring must fill before next ring starts)
  - No anomaly–anomaly adjacency with already-placed tiles (unless unavoidable)
  - No same-wormhole adjacency with already-placed tiles (unless unavoidable)
- **On success:** removes tile from `hands[player_id]`; writes to `placed_tiles`; increments `placement_index`
- **When `placement_index >= placement_order.length`:** merges `placed_tiles` into `games.map_tiles` (including Mecatol at `'0,0'`); sets `draft_state = null`; emits game event log entry

---

## UI Components

### Modified

**`LobbyScreen.jsx`**
- Adds a "setup method" toggle in the host map config area: `Paste Map String` | `In-App Draft`
- When "In-App Draft" is selected, shows a draft mode selector (`Official` / `Milty`) and a **Start Draft** button (calls `startDraft(mode)`)
- When `game.draft_state` is non-null, renders `DraftPanel` in place of the map config area (all players see it)

### New

**`src/hooks/useDraft.js`**
- Reads `game.draft_state` from the `useGame` context (no new subscription)
- Exposes: `startDraft(mode)`, `pickSlice(sliceId)`, `placeTile(tileNumber, position, rotation)`
- Each action calls the corresponding edge function via `edgeFunctions.js` wrappers

**`src/lib/edgeFunctions.js`** (additions)
- `startDraft(gameId, mode)`
- `draftPickSlice(gameId, sliceId)`
- `draftPlaceTile(gameId, tileNumber, position, rotation)`

**`src/components/game/DraftPanel.jsx`**
- Rendered when `game.draft_state !== null`
- Routes to `DraftSlicePickView` (phase `slice-pick`) or `DraftPlacementView` (phase `placement`)

**`src/components/game/DraftSlicePickView.jsx`**
- Displays N slice cards in a grid, each showing: score, tile numbers with R/I/wormhole/anomaly labels
- Active picker's slice cards have a "Pick this slice" button; others' are inert
- Claimed slices are greyed out and show the claimer's name
- Non-active players see the grid read-only

**`src/components/game/DraftPlacementView.jsx`**
- Top: status bar showing current phase, turn number, active player name, next-up player
- Center: `HexMap` (reused from Phase 22/34); when a tile is selected from hand, valid empty hexes in the current ring are highlighted
- Right panel: turn order list with remaining tile counts; ring progress indicator
- Bottom: `DraftTileHand`

**`src/components/game/DraftTileHand.jsx`**
- Horizontal scrolling strip showing the active player's remaining tiles
- Each tile chip shows: tile number, total resources, total influence, wormhole type (if any), anomaly label (if any)
- Clicking a tile selects it (blue ring); clicking again deselects
- Non-active players see their own hand as read-only (greyed)

---

## Placement Validation (client-side + server-side)

Client highlights valid hexes when a tile is selected to give immediate feedback. Server re-validates all constraints in `game-draft-place-tile` before writing.

**Valid hex criteria:**
1. Empty (not in `placed_tiles` and not Mecatol)
2. In the ring currently being filled (ring N+1 only available when ring N is complete)
3. Adjacent to at least one already-placed tile or Mecatol (connected galaxy)
4. Does not create an anomaly–anomaly adjacency
5. Does not create a same-wormhole-type adjacency

Constraints 4 and 5 are "soft blocks": if the player has no tile in hand that avoids the violation, the server allows it (per LRR "unless there is no other option"). Client shows a warning rather than blocking in this case.

---

## Testing

### `game-start-draft`
- Official 6P: 6 hands of 5 tiles each; total tiles match blue/red dealt counts; `placement_order` length = 30
- Milty 6P: 6 slices generated; no slice score differs from another by > 2; `phase = 'slice-pick'`
- Non-host caller → 403
- Draft already in progress → 400

### `game-draft-pick-slice`
- Wrong player → 403
- Already-claimed slice → 400
- Valid pick: `claimed_by` set, tiles in `hands`, `pick_index` incremented
- Last pick: `phase` transitions to `'placement'`, `placement_order` populated

### `game-draft-place-tile`
- Wrong player → 403
- Tile not in hand → 400
- Occupied hex → 400
- Out-of-ring-order hex → 400
- Anomaly–anomaly adjacency with available alternatives → 400
- Anomaly–anomaly adjacency with no alternatives → 200 (warning in response)
- Valid placement: tile removed from hand, added to `placed_tiles`, `placement_index` incremented
- Final tile: `map_tiles` updated, `draft_state` set to null

### `DraftSlicePickView`
- Non-active player: Pick buttons absent; grid visible
- Active player: unclaimed slices show Pick button; claimed slices greyed
- After pick: claimed slice updates in real-time for all players

### `DraftPlacementView`
- Non-active player: hand shown read-only; map shows placed tiles
- Active player: selecting a tile highlights valid hexes; clicking valid hex calls `placeTile`
- Ring progress indicator updates after each placement
- On draft complete: `DraftPanel` unmounts; `MapPreviewSection` shows completed map

---

## Out of Scope

- Tile rotation UI during placement (rotation defaults to 0; can be added in a later phase)
- Milty slice editor (manual slice creation by host)
- Import from external Milty Draft tool
- Undo mid-draft (the existing undo system covers this if needed later)
