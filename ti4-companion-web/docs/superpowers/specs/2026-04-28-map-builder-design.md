# Phase 22: Map Builder — Design Spec

**Date:** 2026-04-28
**Phase:** 22
**Feature Area:** Map Builder (lobby)

---

## Overview

Replace the hardcoded standard 6-player map in `game-start` with a configurable map that the host sets in the lobby. All players see a live map preview. The host can pick a rulebook-recommended preset (base game or PoK, including hyperlane variants) or paste a custom Milty-format map string. Map configuration is lobby-only; it cannot be changed after the game has started.

---

## Architecture & Data Flow

No migration required. `map_tiles` (JSONB, default `{}`) and `map_layout` (TEXT, default `'standard-6'`) already exist on `games`.

The existing `useGame` Realtime subscription already spreads all `games` column changes into state via `setGame(prev => ({ ...prev, ...payload.new }))`, so all connected players receive host map changes live without any subscription changes.

### Flow

1. LobbyScreen fetches the full `tiles` reference table once on mount, building a `tile_number → { id, wormhole, ... }` lookup used for preview rendering and tile_id resolution before save.
2. **All players** see a `MapPreviewSection` component rendered from `game.map_tiles` + tile lookup. Preview is read-only.
3. **Host only** sees a player count selector (3–8), a preset dropdown, and a Milty string textarea above the preview. The player count selector determines which spiral position table is used for parsing and which presets are shown; it is independent of how many players are currently in the lobby. On change, `mapParser.parseMapString(str, playerCount)` runs client-side → `Record<"q,r", { tile_number, rotation? }>`. The result renders immediately in the preview.
4. Host clicks "Save Map" → client resolves `tile_number → tile_id` from the fetched tile lookup, then calls `updateSettings({ map_tiles: resolved, map_layout })`. For presets, `map_layout` = the preset id (e.g. `'pok-recommended-6'`). For custom strings, `map_layout` = `'custom-{playerCount}'` (e.g. `'custom-6'`). All players' previews update via Realtime.
5. `game-start` checks `map_layout`:
   - `'standard-6'` (default): existing hardcoded seeding runs unchanged.
   - Anything else: skip hardcoded inner seeding; use stored `map_tiles` as the non-home base; add home tiles on top using `HOME_POSITIONS_BY_COUNT[playerCount]`.

---

## map_tiles Entry Format

Existing format extended with optional `rotation` field:

```json
{
  "q,r": { "tile_id": "uuid", "tile_number": "83", "rotation": 2 }
}
```

- `rotation`: integer 0–5 representing 0°–300° in 60° steps. Absent or 0 means no rotation.
- Existing entries without `rotation` default to 0° — no breaking change.

---

## Milty Map String Format

Space-separated tile numbers in spiral order, **excluding Mecatol Rex** (always fixed at `0,0`) and **excluding home system tiles** (placed by `game-start` from faction picks).

Token count by player count:

| Players | Ring 1 | Ring 2 | Ring 3 non-home | Total tokens |
|---------|--------|--------|-----------------|--------------|
| 3       | 6      | 12     | 15              | 33           |
| 4       | 6      | 12     | 14              | 32           |
| 5       | 6      | 12     | 13              | 31           |
| 6       | 6      | 12     | 12              | 30           |
| 7       | 6      | 12     | 11 + 4 ring-4   | 33           |
| 8       | 6      | 12     | 10 + 8 ring-4   | 36           |

Hyperlane tile rotation is encoded as a suffix: `83rot2` (tile 83, rotation 2). Unrecognised suffix defaults to `rotation: 0`.

`0` as a token means an empty space (no tile placed at that position).

---

## Preset Maps

Defined in `mapParser.js` as `PRESET_MAPS`:

```js
{ id, name, playerCount, mapString, requiresPok }
```

Covers all rulebook-recommended maps for 3–8 players:
- Base game maps: `requiresPok: false`
- PoK maps (including hyperlane variants): `requiresPok: true`

The LobbyScreen filters out PoK presets when `game.expansions.pok` is false.

---

## Files

### New

| File | Purpose |
|------|---------|
| `src/lib/mapParser.js` | Spiral position tables (3–8P), `HOME_POSITIONS_BY_COUNT`, `parseMapString(str, playerCount)`, `PRESET_MAPS` |
| `src/components/game/MapPreviewSection.jsx` | Read-only SVG map preview; applies SVG rotation transform for hyperlane tiles |

### Modified

| File | Change |
|------|--------|
| `src/components/game/LobbyScreen.jsx` | Fetches `tiles` table on mount; renders `MapPreviewSection` for all players; player count selector + preset dropdown + Milty textarea + "Save Map" button for host only; PoK presets disabled (not hidden) when PoK expansion off |
| `src/lib/edgeFunctions.js` | Extend `updateSettings` wrapper to accept `map_tiles` + `map_layout` |
| `supabase/functions/game-update-settings/index.ts` | Accept and write `map_tiles` (object) and `map_layout` (string) fields |
| `supabase/functions/game-start/index.ts` | Add `HOME_POSITIONS_BY_COUNT` (3–8P); skip hardcoded inner seeding when `map_layout !== 'standard-6'`; place homes using player-count positions |

---

## Validation & Error Handling

### Client-side (mapParser.js)

- Wrong token count → descriptive error: `"Expected 30 tiles for 6 players, got 28"`
- Unknown tile number → `"Unknown tile: 999 at position 14"`
- Unrecognised rotation suffix → default `rotation: 0`, no error
- Duplicate tile number → error; hyperlane tiles 83–91 exempt (multiple copies exist in PoK)

### LobbyScreen

- Parse errors display inline below the textarea; "Save Map" disabled while error exists
- PoK presets always visible but greyed out (disabled) with a tooltip explaining PoK must be enabled; they become selectable when PoK is toggled on
- Warning shown if host saves a PoK map then disables PoK expansion (saved map contains PoK tiles)

### game-update-settings

- `map_tiles` must be a non-null object
- `map_layout` must be a non-empty string
- Tile contents not validated server-side (client already validated)

### game-start

- `map_layout !== 'standard-6'` but `map_tiles` is `{}` → fall back to hardcoded standard-6 seeding
- Player count exceeds available home positions for the stored map → 409 error before starting

---

## Testing

### mapParser.js (unit)

- Valid 6P Milty string → correct axial keys + tile numbers
- Valid strings for each player count 3–8 → correct position count
- Hyperlane tile with rotation suffix → `rotation` field set correctly
- Wrong token count → returns error string (does not throw)
- Unknown tile number → returns error with position info
- Duplicate tile number → error (non-hyperlane)
- All preset maps parse without errors

### MapPreviewSection (component)

- Renders correct number of SVG elements for given `map_tiles`
- Hyperlane tile receives SVG rotation transform matching its `rotation` field
- Empty `map_tiles` renders empty state without error

### LobbyScreen (component)

- Non-host sees preview but not dropdown / textarea / save button
- Host sees all controls
- PoK presets visible but disabled when `game.expansions.pok` is false; enabled when PoK is on
- "Save Map" disabled while parse error exists
- Realtime update to `map_tiles` re-renders preview for all players

### game-update-settings (integration)

- Host saves `map_tiles` + `map_layout` during lobby → success
- Non-host → 403
- Post-start → 409
- Null `map_tiles` → 400

### game-start (integration)

- Custom map → stored `map_tiles` preserved; homes placed at correct positions for player count
- Default `map_layout` → hardcoded seeding unchanged
- Non-default `map_layout` with empty `map_tiles` → falls back to standard-6
