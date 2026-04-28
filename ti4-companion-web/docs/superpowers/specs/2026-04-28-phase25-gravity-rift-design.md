# Phase 25: Gravity Rift

## Rules Basis (LRR §41)

- **§41.1** A ship moving out of or through a gravity rift applies +1 to its move value.
- **§41.2** For each such ship, one die is rolled immediately before it exits the rift system; on a result of 1–3 the ship is destroyed (returned to reinforcements). Transported units are exempt from the roll but are destroyed if their carrier is destroyed.
- **§41.3** A gravity rift can affect the same ship multiple times in a single movement.
- **§41.4** Multiple gravity rifts in a system are treated as a single gravity rift.

Die is a d10 (1–10); destroyed on 1–3.

---

## Overview

Phase 25 adds interactive gravity rift transit resolution on top of Phase 18's movement system. When a player moves ships through a rift system, the move is held server-side until all rift dice are resolved. The active player chooses to roll one ship at a time or all at once. Ships rolling 1–3 are destroyed along with their carried cargo.

**Depends on:** Phase 18 (Unit Transport / `game-move-ships`)

---

## Section 1: Database Schema

New table: `game_rift_transits`

```sql
CREATE TABLE game_rift_transits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  system_key      TEXT NOT NULL,              -- q,r of the rift system being exited
  destination_key TEXT NOT NULL,              -- final destination system_key for the move
  player_id       UUID NOT NULL REFERENCES profiles(id),
  ships           JSONB NOT NULL,             -- array of ship roll records (see below)
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'complete'
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**`ships` JSONB element shape:**

```json
{
  "unit_id": "<uuid>",
  "unit_type": "Carrier",
  "roll": null,
  "destroyed": false,
  "cargo": [
    { "unit_id": "<uuid>", "unit_type": "Fighter" },
    { "unit_id": "<uuid>", "unit_type": "Infantry" }
  ]
}
```

- `roll`: `null` until resolved, then 1–10
- `destroyed`: `true` if roll ≤ 3
- `cargo`: transported units (fighters, infantry in space area) assigned to this ship up to its capacity; not rolled but destroyed if carrier is destroyed

**RLS:** players can read rows for their active game. Write access enforced in Edge Function via auth check (matching existing pattern).

---

## Section 2: Movement Integration

### `game-move-ships` (modified, Phase 18 base)

The client sends: `{ destination_key, path: [system_key, ...], unit_ids }` where `path` is the ordered list of systems traversed from origin (inclusive) to destination. Including the origin means a ship that starts in a rift and moves out correctly triggers a roll.

Server additions:

1. For each `system_key` in `path` (excluding `destination_key`), join `games.map_tiles` → `tiles` reference table; collect any with `anomaly_type = 'gravity_rift'`.
2. If no rift systems: proceed with Phase 18 move immediately (no change).
3. If rift systems found:
   - **Ships** (roll dice): all unit_ids with `unit_type` not in `['Fighter', 'Infantry']` and `on_planet IS NULL`.
   - **Transported units** (cargo, no roll): all unit_ids with `unit_type` in `['Fighter', 'Infantry']` and `on_planet IS NULL`.
   - Assign transported units to carrier ships greedily by capacity (sourced from `units` reference table). Embed as `cargo` arrays.
   - Insert one `game_rift_transits` row per rift system in path order, each with `status = 'pending'`.
   - **Do not move units yet** — origin positions are preserved until the final transit completes.

### Client-side movement range calculation (modified)

When the Galaxy tab computes reachable systems for a ship, if a candidate path crosses a rift system, add +1 to the ship's effective move value for that path. Server re-validates on receipt.

---

## Section 3: Edge Functions

### `game-roll-rift-dice` (new)

**Request:** `{ transit_id, roll_all: boolean, unit_id?: string }`

**Logic:**

1. Fetch `game_rift_transits` by `transit_id`; verify `auth.uid() === player_id`; verify `status = 'pending'`. Return 403 / 409 on failure.
2. If `roll_all = true`: for every ship where `roll IS NULL`, roll `Math.floor(Math.random() * 10) + 1`; set `destroyed = true` where roll ≤ 3.
3. If `roll_all = false`: roll only the ship matching `unit_id`.
4. Update `ships` JSONB in the row.
5. If all ships now have a non-null `roll`:
   - Delete `game_player_units` rows for all destroyed ships and their `cargo` unit_ids (single operation).
   - Check for another `game_rift_transits` row for the same game with `status = 'pending'` and earlier `created_at`. If found, leave it pending (sequential multi-rift resolution).
   - Otherwise: update `system_key` in `game_player_units` to `destination_key` for all surviving ships and their cargo; set transit `status = 'complete'`.

---

## Section 4: Client

### `src/lib/edgeFunctions.js` (modified)

Add: `rollRiftDice(transitId, rollAll, unitId)` — calls `game-roll-rift-dice`.

### `src/hooks/useRiftTransit.js` (new)

- Subscribes to `game_rift_transits` via Realtime filtered by `game_id` and `status = 'pending'`
- Exposes: `activeTransit` (pending row or `null`), `rollAll()`, `rollOne(unitId)`, `loading`, `error`
- `rollAll()` / `rollOne()` call `rollRiftDice` via `edgeFunctions`

### `src/components/game/RiftTransitModal.jsx` (new)

**Props:** `{ transit, myPlayerId, players, onRollAll, onRollOne, onClose, loading, error }`

**Renders:**

- Header: "GRAVITY RIFT — {rift system name}" (derived client-side: look up `transit.system_key` in `games.map_tiles` to get tile_id, then resolve tile name from the `tiles` reference data already available via `useGame`)
- List of ships: unit type, cargo summary ("2 Fighters, 1 Infantry"), die roll result ("—" if unrolled), destroyed/safe badge
- **Roll All** button (disabled if loading or all rolled) → `onRollAll()`
- **Roll One** button (rolls topmost unrolled ship) → `onRollOne(firstUnrolledUnitId)`
- Error display
- **Done** button (visible only when all ships rolled) → `onClose()`
- Non-active player sees read-only view: "Waiting for [player name] to resolve gravity rift…" with the same ship list (updated live via Realtime)
- Returns `null` when `transit` is null

### `src/components/game/GameScreen.jsx` (modified)

- Add `useRiftTransit` hook
- Render `<RiftTransitModal>` when `activeTransit` is non-null; pass callbacks

---

## Section 5: Testing

### `game-roll-rift-dice` Edge Function

- `roll_all: true`: all null rolls populated; ships with roll ≤ 3 marked destroyed; their cargo unit_ids deleted from `game_player_units`
- `roll_all: false`: only targeted ship rolled; others remain null
- Last roll resolves: surviving ships (and cargo) moved to `destination_key`; transit set to `complete`
- Multi-rift sequential: completing transit A leaves transit B pending; units not moved yet
- Non-owning player → 403
- Already-complete transit → 409

### `useRiftTransit`

- Returns `null` when no pending transit
- Subscribes on mount; updates `activeTransit` on Realtime event
- `rollAll()` calls edge function with `roll_all: true`
- `rollOne(unitId)` calls edge function with correct `unit_id`

### `RiftTransitModal`

- Renders `null` when `transit` is null
- Shows each ship with cargo counts
- Roll All button calls `onRollAll`; Roll One calls `onRollOne` with first unrolled ship
- Rolled ships show result; destroyed ships show destroyed indicator
- Done button visible only when all ships rolled; calls `onClose`
- Non-owner sees read-only waiting message (no roll buttons)

### `game-move-ships`

- Rift in path → creates transit record; units not moved
- No rift in path → units moved immediately (Phase 18 behaviour unchanged)
- Cargo assignment: transported units distributed to capacity ships correctly
- Multiple rifts in path → one transit record per rift, created in path order
