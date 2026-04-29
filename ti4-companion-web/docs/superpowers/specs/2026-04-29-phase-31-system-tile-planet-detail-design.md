# Phase 31: System Tile & Planet Detail View

## Overview

Read-only detail views for system tiles and planets. Two surfaces:
1. **Galaxy tab** — INFO button on the existing system action modal opens a `SystemInfoModal` showing full tile data (planets with stats, wormholes, anomalies). Accessible to all players at any time.
2. **My Panel** — Planet rows in `MyPanelSection` expanded inline to show resources, influence, tech specialty, and traits alongside the existing EXHAUST/READY button.

No Edge Functions, no DB migrations, no new fetches.

---

## Data Flow

`useGalaxy` already holds `tileData` (tile_id → tile with `planets`, `wormholes`, `anomalies`). A new `planetStaticMap` is computed from it at return time, alongside the existing `planetOwnership`:

```
planetStaticMap: { [planet_name]: { resources, influence, tech_specialty, traits } }
```

Built by iterating `Object.values(tileData)` and flattening each tile's `planets` array. `tech_specialty` defaults to `null` if absent; `traits` defaults to `[]` (sourced from the `type` field in the tile planet schema).

`GameScreen` spreads `galaxyState` into `GalaxyTab` (already), so `planetStaticMap` arrives there for free. It also passes `planetStaticMap` as an explicit prop to `MyPanelSection`.

---

## Components

### `useGalaxy.js` — Modify

Two changes:
1. Update the tile select query from `'id, tile_number, planets, type, wormhole'` to `'id, tile_number, planets, type, wormholes, anomalies'` — `wormholes` (text[]) and `anomalies` (text[]) are the correct column names per the schema; `wormhole` (singular) was a pre-existing typo.
2. Add `planetStaticMap` to the return value. Computed from `tileData` at the same time as `planetOwnership` (no new state, no new fetches).

### `MyPanelSection.jsx` — Modify

New prop: `planetStaticMap` (map from planet_name → static data).

Planet rows expand from `[name] [EXHAUST/READY]` to:

```
[name]  [res/inf e.g. "3/2"]  [tech chip]  [trait labels]    [EXHAUST/READY]
```

- Resources/influence: `"{res}/{inf}"` in muted text
- Tech specialty: small coloured chip — green/blue/red/yellow matching the colour token convention; omitted if `null`
- Traits: small dim labels (CULTURAL / INDUSTRIAL / HAZARDOUS / LEGENDARY); omitted if empty
- If `planetStaticMap` is absent or has no entry for a planet name, row renders as before (graceful fallback)

### `SystemActionModal.jsx` — Modify

Add an "INFO" button in the modal header area. Calls new `onInfo` prop. No other changes.

### `SystemInfoModal.jsx` — New

Pure presentational modal. Props: `tileInfo`, `systemKey`, `onClose`.

Sections:
- Header: `SYSTEM {systemKey}`
- Planets: for each planet — name, `res/inf`, tech specialty chip, trait labels
- Wormholes: listed if `tileInfo.wormholes` is non-empty
- Anomalies: listed if `tileInfo.anomalies` is non-empty
- CLOSE button

No actions, no state mutations.

### `GalaxyTab.jsx` — Modify

Add `infoSystemKey` state (initially `null`). Pass `onInfo={() => setInfoSystemKey(selectedSystemKey)}` to `SystemActionModal`. Render `SystemInfoModal` when `infoSystemKey` is set, passing the matching `tileInfo` and `onClose={() => setInfoSystemKey(null)}`. Thread `planetStaticMap` through to both modals.

### `GameScreen.jsx` — Modify

Pass `planetStaticMap={galaxyState.planetStaticMap}` to `MyPanelSection`.

---

## Rules Basis

Phase 31 is purely informational — it displays data already stored (planet resources, influence, traits, tech specialties, system anomalies, wormholes). No rule mechanics are introduced. Data definitions come from LRR §64 Planets and §88 System Tiles.

---

## Testing

**`useGalaxy`**
- `planetStaticMap` is populated from `tileData`
- Planet with no `tech_specialty` → `null`; planet with no `type` → `[]`

**`MyPanelSection`**
- With `planetStaticMap`: planet row shows `res/inf`, tech chip when present, trait labels when present
- Without `planetStaticMap` or missing entry: row renders name + EXHAUST/READY, no crash

**`SystemInfoModal`**
- Renders planet name, resources/influence, tech specialty, traits
- Renders wormhole label when present; renders anomaly label when present
- CLOSE calls `onClose`

**`SystemActionModal`**
- INFO button renders and calls `onInfo` when clicked

**`GalaxyTab`**
- Clicking INFO in `SystemActionModal` opens `SystemInfoModal`
- Clicking CLOSE on `SystemInfoModal` dismisses it
