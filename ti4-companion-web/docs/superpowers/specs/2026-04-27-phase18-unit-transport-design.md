# Phase 18 — Unit Transport Design

**Date:** 2026-04-27
**Status:** Approved

---

## Rules Basis

- **§16 Capacity** — a ship's capacity value = max combined fighters + ground forces it can transport; combined capacity of all ships in a system limits how many fighters + infantry can be in that space area; excess must be removed after movement resolves (not during combat)
- **§58.4 Movement** — ships must end in the active system; cannot start in a system containing the player's own command token (unless that system is the active system); cannot pass through enemy-occupied systems; path length ≤ move value; +1 move per gravity rift traversed
- **§59 Nebula** — ships cannot move through a nebula; a nebula may only be the final destination; ships starting in a nebula have move value capped to 1
- **§11 Asteroid Field / §86 Supernova** — ships cannot move through or into these anomalies
- **§41 Gravity Rift** — ships moving through or out of a gravity rift gain +1 move value; destruction roll on 1–3 is deferred to Phase 25
- **§95 Transport** — when a ship with capacity moves, it may carry fighters and ground forces; units may be picked up from the ship's start system, the active system, and each transit system; cannot pick up from a system containing the player's command token (except the active system); transported units end in the space area of the active system

---

## Scope

Phase 18 implements full ship movement tracking: ships are physically relocated in `game_player_units` when they move to the active system, with capacity-enforced transport of fighters and infantry. It does not include the gravity rift destruction roll (Phase 25) or ability-driven movement outside the tactical action (Phase 19).

---

## Data Model

No new migration required. Existing tables are sufficient:

- `game_player_units` — `system_key`, `unit_type`, `count`, `on_planet`; ships are updated to the active system's `system_key` on move
- `units` — `move`, `capacity` reference data already populated
- `game_system_activations` — used to detect whether a ship's origin system has a command token this round
- `tiles` — `anomalies TEXT[]` used to classify asteroid fields, supernovas, nebulae, gravity rifts
- `games.map_tiles` — JSONB mapping `system_key → { tile_id }` used to resolve anomaly type and wormhole adjacency per system

---

## API Contract

### `game-move-ships`

**Request:**
```json
{
  "game_id": "<uuid>",
  "active_system_key": "1,2",
  "ships": [
    {
      "unit_type": "carrier",
      "origin_system_key": "0,1",
      "path": ["0,1", "1,1", "1,2"],
      "cargo": [
        { "unit_type": "infantry", "system_key": "0,1", "count": 2 },
        { "unit_type": "fighter",  "system_key": "1,1", "count": 1 }
      ]
    }
  ],
  "excess_removals": [
    { "system_key": "0,1", "unit_type": "fighter", "count": 1 }
  ]
}
```

- `path` — ordered system keys from origin (inclusive) to active system (inclusive)
- `cargo` — units the ship picks up, keyed by the system where pickup occurs; each system must be on the ship's path or the active system
- `excess_removals` — units the player elects to remove from over-capacity systems after movement; client pre-calculates and includes in the same call; server rejects if the declared removals do not fully resolve all excess

**Response:**
```json
{
  "moved": true,
  "units_removed": [
    { "system_key": "0,1", "unit_type": "fighter", "count": 1 }
  ]
}
```

---

## Server-Side Validation

All checks run before any DB writes. Failure on any check rejects the entire request.

### Per ship

| # | Check | Source |
|---|-------|--------|
| 1 | Ship exists in `game_player_units` at `origin_system_key` for this player | DB |
| 2 | Each hop in `path` is axially adjacent or wormhole-connected to the previous | `games.map_tiles` + `tiles.wormhole` |
| 3 | Path length (hops entered) ≤ ship's move value; +1 per gravity rift traversed | `units.move`, `tiles.anomalies` |
| 4 | Ship's final system equals `active_system_key` | payload |
| 5 | Origin system has no player command token this round, unless origin = active system | `game_system_activations` |
| 6 | No transit hop enters a system with enemy ships in the space area | `game_player_units` |
| 7 | No hop enters or passes through an asteroid field or supernova | `tiles.anomalies` |
| 8 | A nebula appears only as the final hop (the active system); cannot be a transit hop | `tiles.anomalies` |
| 9 | If origin is a nebula, ship move value is capped to 1 | `tiles.anomalies` |

### Per cargo entry

| # | Check | Source |
|---|-------|--------|
| 10 | Unit type is `fighter` or `infantry` only | payload |
| 11 | Pickup system is in the ship's `path` or equals `active_system_key` | payload |
| 12 | Pickup system does not have the player's command token this round, unless it equals `active_system_key` | `game_system_activations` |
| 13 | Total cargo count across all pickup systems ≤ ship's capacity | `units.capacity` |

### Post-movement capacity

| # | Check | Source |
|---|-------|--------|
| 14 | `excess_removals` fully resolves any over-capacity in each origin system after its ships depart | computed |
| 15 | `excess_removals` fully resolves any over-capacity in the active system after all ships arrive | computed |

### Write pass (after all validation passes)

1. Update each ship's `system_key` in `game_player_units` to `active_system_key`
2. For each cargo entry: decrement count from source system row; upsert into active system row
3. Apply `excess_removals`: decrement counts; delete rows where count reaches 0

All writes are performed sequentially with early-exit on any DB error (no partial commits via individual error returns).

---

## UI Components

### `useMovement` hook — `src/hooks/useMovement.js`

Client-side state and helpers for the movement modal:

- Tracks: selected ships, declared paths, cargo per ship, excess removals
- Exposes: `reachableSystems(ship, step)` — systems the player can tap next given move value remaining, anomaly rules, and enemy presence
- Exposes: `capacityRemaining(ship)` — cargo slots left on a given ship
- Exposes: `excessBySystem()` — map of `system_key → { unit_type, excess_count }` for over-capacity systems after the current declaration
- Exposes: `isReadyToConfirm()` — true when all excess is resolved
- Calls `edgeFunctions.js: moveShips(payload)` on confirm

### `MoveShipsModal` — `src/components/game/MoveShipsModal.jsx`

Full-screen modal over the galaxy map. Three sequential sub-steps:

**Step 1 — Select ships:** Player taps a system; eligible ships (origin has no command token, move > 0) are listed. Player toggles ships to include. Systems with eligible ships are highlighted on the map.

**Step 2 — Draw routes:** For each selected ship in turn, player taps systems to extend the path. The map highlights legal next hops in real time (valid adjacency, anomaly rules, enemy presence greys out blocked systems). Move-value-remaining counter shown per ship. Gravity rift systems show "+1 move" badge. At each system on the path, a cargo picker appears listing the player's fighters and infantry in that system's space area; player selects how many to load (capped by capacity remaining).

**Step 3 — Resolve excess:** Once all routes are finalised, over-capacity systems are listed. For each, the player selects which units to remove until excess reaches zero. "Confirm Movement" button activates only when `isReadyToConfirm()` is true.

On confirm: calls `game-move-ships`. On success: closes modal; Realtime subscription updates galaxy map.

### `GalaxyTab` changes — `src/components/game/GalaxyTab.jsx`

- Adds a "Move Ships" button visible only to the active player during the movement step (after activation, before space cannon / combat)
- Button replaced with "Skip Movement" if the active player has no ships that can legally reach the active system
- Opens `MoveShipsModal` with the active system key

---

## Testing

### Edge function — `game-move-ships`

- Happy path: carrier moves 1 hop carrying 2 infantry; DB rows updated correctly
- Happy path: ship picks up fighters from a transit system mid-path
- Rejects if caller is not the active player
- Rejects if ship's origin has a player command token this round (not the active system)
- Rejects if path length exceeds move value
- Rejects if a hop is not adjacent (neither axial nor wormhole)
- Rejects if path passes through an enemy-occupied system
- Rejects if path passes through an asteroid field or supernova
- Rejects if path passes through (not ends at) a nebula
- Ships starting in a nebula: move value capped to 1
- Gravity rift: +1 move value applied; ship can reach one system further than normal
- Rejects if cargo count exceeds ship capacity
- Rejects if cargo picked up from a system with player's command token (not active)
- Rejects if `excess_removals` does not fully resolve over-capacity in origin system
- Rejects if `excess_removals` does not fully resolve over-capacity in active system
- Applies `excess_removals` correctly; zeroed rows deleted

### Hook — `useMovement`

- `reachableSystems` returns correct set given move value, anomalies, enemy presence
- Capacity tracking decrements as cargo is added
- Excess calculation correct when ships leave an origin
- Excess calculation correct when ships arrive in active system

### Component — `MoveShipsModal`

- Renders ship selection step on open
- Path draw step shows move-value-remaining counter per ship
- Cargo picker shows only fighters and infantry
- Confirm button disabled until all excess resolved
- Calls `game-move-ships` with correct payload on confirm

---

## Out of Scope

- Gravity rift destruction roll (§41.2) — deferred to Phase 25; noted in `POTENTIAL_TODOS.md`
- Ability-driven movement outside the tactical action (§58.8) — deferred to Phase 19 Ability DSL
- Damaged ship movement restrictions — no rule change; damaged ships move normally
