# Phase 9 — Galaxy Map Design Spec

**Date:** 2026-04-21  
**Status:** Approved

---

## Goal

Add a dedicated Galaxy tab to the in-game UI that displays the TI4 hex map, allows the active player to activate systems, supports landing troops on planets (claiming them), and wires the Custodians token to auto-unlock the Agenda Phase.

---

## Scope

- Dedicated **GALAXY tab** alongside MY PANEL and SCOREBOARD
- **SVG hex grid** — 37 hardcoded tiles, standard 5-ring spiral layout
- **Rich hex display** — tile number, planet names + status dots, tactic token badges (overlapping, player-coloured), unit count badge
- **System activation** — active player only; validates tactic token availability
- **Land Troops** — simplified flow: tap activated system → tap planet → land 1 ground force → claim planet
- **Custodians gate** — landing on Mecatol Rex ("0,0") sets `custodians_claimed=true`, `agenda_unlocked=true`, awards 1 VP
- **Automatic Agenda Phase** — `game-advance-phase` patched to advance to `agenda` after status phase when `agenda_unlocked=true`; manual "Begin Agenda Phase" button removed

### Deferred to POTENTIAL_TODOS.md

- Map builder in lobby (paste Milty string or drag-and-drop)
- Variable troop counts when landing (Phase 9 always lands 1)
- Unit movement between systems
- Combat resolution

---

## Architecture

### Approach

Dedicated `useGalaxy` hook (Option 2). `GameScreen` calls `useGalaxy(code, userId)` alongside `useGame`, passes results down to `GalaxyTab`. Keeps galaxy concerns out of the already-large `useGame` hook.

---

## Section 1: Database

No new tables or columns needed. All required structures already exist:

- `games.map_tiles JSONB` — populated by `game-start` patch
- `games.custodians_claimed BOOLEAN`
- `games.agenda_unlocked BOOLEAN`
- `game_player_planets` — `planet_name`, `player_id`, `tile_id`, `exhausted`, etc.
- `game_player_units` — `system_key`, `unit_type`, `count`, `on_planet`
- `game_system_activations` — `system_key`, `player_id`, `round`, `token_owner_id`

### map_tiles JSONB format

Keys are axial coordinates `"q,r"` — the same format used by `system_key` on all other tables. Values carry `tile_id` and `tile_number` for frontend lookups:

```json
{
  "0,0":  { "tile_id": "<uuid>", "tile_number": "18" },
  "1,0":  { "tile_id": "<uuid>", "tile_number": "27" },
  "-1,1": { "tile_id": "<uuid>", "tile_number": "5"  }
}
```

The hardcoded 37-tile layout uses the standard TI4 5-ring axial spiral. Home system positions are assigned based on player count (2–8 players).

### Migration

No schema migration needed. `027_phase9.sql` may be omitted; the only DB change is `game-start` seeding `map_tiles`.

---

## Section 2: Edge Functions

### game-start (patch)

After dealing promissory notes, seed `map_tiles` with the hardcoded 37-tile layout:

1. Fetch all `tiles` rows to resolve tile numbers → UUIDs
2. Build the 37-entry axial map (hardcoded coordinates + tile number assignments)
3. Assign home system positions per faction/player count
4. `UPDATE games SET map_tiles = $map WHERE id = $game_id`

### game-activate-system (new)

**Input:** `game_id`, `system_key`

**Validates:**
- Caller is `games.active_player_id`
- System not already activated by caller this round (`game_system_activations`)
- Caller has tactic tokens available: `tactic_total − COUNT(activations this round) > 0`

**Writes:** `INSERT INTO game_system_activations (game_id, player_id, system_key, round, token_owner_id)`

**Returns:** `{ activated: true }`

### game-land-troops (new)

**Input:** `game_id`, `system_key`, `planet_name`, `troop_count` (always 1 in Phase 9)

**Validates:**
- System is activated by caller this round
- `planet_name` exists in the tile at `system_key` (via `map_tiles` → `tiles.planets`)
- `troop_count >= 1`

**Writes:**
- `UPSERT game_player_planets` — claim planet for caller (set `player_id`, `tile_id`)
- `UPSERT game_player_units` — add infantry on planet (`unit_type='infantry'`, `on_planet=planet_name`)
- If `system_key = "0,0"` AND `games.custodians_claimed = false`:
  - `UPDATE games SET custodians_claimed=true, agenda_unlocked=true`
  - `UPDATE game_players SET vp = vp + 1` (caller)

**Returns:** `{ claimed: true, custodians_claimed?: true }`

### game-advance-phase (patch)

After status phase completes, the existing logic advances to `strategy`. Add a branch:

```
IF games.agenda_unlocked = true
  → next phase = 'agenda'  (automatic)
ELSE
  → next phase = 'strategy'  (existing behaviour)
```

### HostControlsSection (patch)

Remove the "Begin Agenda Phase" button entirely. The Agenda Phase now starts automatically.

---

## Section 3: Data Layer — useGalaxy hook

`useGalaxy(gameCode, userId)` is called from `GameScreen` alongside `useGame`.

### State

| Name | Source | Description |
|------|--------|-------------|
| `mapTiles` | `games.map_tiles` | `{ "q,r": { tile_id, tile_number } }` |
| `tileData` | `tiles` table | Rows indexed by `tile_id` — planets JSONB, type, wormhole |
| `activations` | `game_system_activations` | All rows for current round |
| `allPlanets` | `game_player_planets` | All claimed planets across all players |
| `systemUnits` | `game_player_units` | All unit rows, grouped by `system_key` |

### Derived (computed in hook)

| Name | Description |
|------|-------------|
| `activatedSystems` | `Set<string>` of `system_key`s activated by any player this round |
| `myActivations` | `Set<string>` of `system_key`s activated by current player |
| `planetOwnership` | `Map<planet_name, { player_id, colour, exhausted }>` |

### Realtime subscriptions

- `game_system_activations` → refresh `activations`
- `game_player_planets` → refresh `allPlanets`
- `game_player_units` → refresh `systemUnits`
- `games` (map_tiles column) → refresh `mapTiles`

### Action wrappers

The hook fetches the game by code on mount to resolve `gameId`. Action wrappers returned from the hook are closures with `gameId` already bound — callers only pass the game-specific arguments:

```js
activateSystem(systemKey)                      // gameId bound internally
landTroops(systemKey, planetName, troopCount)  // gameId bound internally
```

### edgeFunctions.js additions

```js
export const activateSystem = (gameId, systemKey) =>
  callFunction('game-activate-system', { game_id: gameId, system_key: systemKey })

export const landTroops = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-land-troops', { game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount })
```

---

## Section 4: Components

### Component hierarchy

```
GameScreen
  ├── useGalaxy(code, userId)         ← new hook
  ├── GameHeader
  ├── [tab: MY PANEL]   → MyPanelSection         (unchanged)
  ├── [tab: SCOREBOARD] → ScoreboardSection       (unchanged)
  ├── [tab: GALAXY]     → GalaxyTab               ← new
  │     ├── HexMap                                ← new
  │     │     └── HexTile (×37)                  ← new
  │     └── SystemActionModal (conditional)       ← new
  └── HostControlsSection (patch — remove agenda button)
```

### GalaxyTab

Thin container. Receives all galaxy state from `GameScreen` as props. Manages `selectedSystemKey` state for the action modal. Renders `HexMap` and conditionally `SystemActionModal`.

### HexMap

SVG element sized to fill the tab. Computes pixel positions from axial coordinates using the **flat-top hex formula**:

```
x = size × (3/2 × q)
y = size × (√3/2 × q + √3 × r)
```

Renders one `HexTile` per entry in `mapTiles`. Supports zoom/pan via SVG `viewBox` manipulation (pinch/scroll).

### HexTile

Single SVG `<g>` group at the computed position. Renders:

- **Hex polygon** — border colour = colour of the player who activated the system this round (if exactly one activating player); neutral grey if unactivated or multiple players have activated it
- **Tile number** — top centre, gold
- **Planet rows** — one row per planet: status dot + name
  - Green filled dot = claimed and ready
  - Hollow dot = claimed and exhausted  
  - Grey dot = unclaimed
- **Tactic token badges** — top-right corner; one overlapping coloured circle per activating player (player colour + dark outline between badges); absent if no activations
- **Unit count badge** — bottom centre; shows total infantry count if any troops present

Calls `onSelect(systemKey)` on click.

### SystemActionModal

Opens when a hex is tapped. Shows available actions based on game state:

| Condition | Action shown |
|-----------|-------------|
| Caller is active player + has tactic tokens + system not yet activated by caller | **ACTIVATE SYSTEM** button |
| System activated by caller this round | **LAND ON [planet]** button per planet in the system |
| Neither condition met | Info only (who owns what, unit counts) |

Landing always lands 1 troop (Phase 9 simplification). The Custodians message ("You claimed the Custodians! +1 VP") is shown if `custodians_claimed` flips to `true` in the response.

---

## Section 5: Integration

### GameScreen changes

```js
import { useGalaxy } from '../../hooks/useGalaxy.js'
import GalaxyTab from './GalaxyTab.jsx'

// In component:
const galaxyState = useGalaxy(code, userId)
const [activeTab, setActiveTab] = useState('my-panel') // 'my-panel' | 'scoreboard' | 'galaxy'

// Tab bar gets third button: GALAXY
// Render:
{activeTab === 'galaxy' && (
  <GalaxyTab
    {...galaxyState}
    players={players}
    currentPlayer={currentPlayer}
    game={game}
  />
)}
```

---

## File Structure

### Edge Functions

| File | Status |
|------|--------|
| `supabase/functions/game-activate-system/index.ts` | New |
| `supabase/functions/game-land-troops/index.ts` | New |
| `supabase/functions/game-start/index.ts` | Patch — seed map_tiles |
| `supabase/functions/game-advance-phase/index.ts` | Patch — auto agenda |

### React

| File | Status |
|------|--------|
| `src/hooks/useGalaxy.js` | New |
| `src/components/game/GalaxyTab.jsx` | New |
| `src/components/game/HexMap.jsx` | New |
| `src/components/game/HexTile.jsx` | New |
| `src/components/game/SystemActionModal.jsx` | New |
| `src/components/game/GameScreen.jsx` | Modify — useGalaxy, tab, GalaxyTab |
| `src/components/game/HostControlsSection.jsx` | Modify — remove agenda button |
| `src/lib/edgeFunctions.js` | Modify — activateSystem, landTroops |

### Tests

| File | Status |
|------|--------|
| `tests/functions/game-activate-system.test.js` | New |
| `tests/functions/game-land-troops.test.js` | New |
| `tests/functions/game-start.test.js` | Patch — map_tiles seeding |
| `tests/functions/game-advance-phase.test.js` | Patch — agenda auto-advance |
| `tests/components/game/GalaxyTab.test.jsx` | New |
| `tests/components/game/HexMap.test.jsx` | New |
| `tests/components/game/HexTile.test.jsx` | New |
| `tests/components/game/SystemActionModal.test.jsx` | New |
| `tests/hooks/useGalaxy.test.js` | New |
| `tests/lib/edgeFunctions.phase9.test.js` | New |

---

## Error Handling

- `game-activate-system` returns 409 if caller is not active player, no tactic tokens left, or system already activated by caller
- `game-land-troops` returns 409 if system not activated by caller, planet not in system, or troop_count < 1
- Both functions return 401 for unauthenticated requests, 404 if player not in game

---

## Testing Strategy

Edge function tests follow the existing mock pattern (`vi.mock` on `_shared/auth.ts` and `_shared/db.ts`). Component tests use `@testing-library/react`. Hook tests use the existing `useGame` phase test pattern.

Key test cases:
- `game-activate-system`: non-active player rejected, no tokens rejected, duplicate activation rejected, success inserts row
- `game-land-troops`: unactivated system rejected, invalid planet rejected, custodians claim triggered on "0,0", VP incremented
- `game-advance-phase` patch: agenda_unlocked=true → next phase is agenda; agenda_unlocked=false → next phase is strategy
- `HexTile`: renders planet status dots, tactic token badges per player, unit count badge
- `SystemActionModal`: shows activate button only to active player, shows land buttons only when system activated
