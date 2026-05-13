# Phase 35 — Mech Plastic Unit Visualization

**Date:** 2026-05-13
**Feature area:** Map tiles + System Info Modal — mech unit visibility
**Scope:** Show mech counts in the HexTile ground-force badge (bundled into Phase 34 spec) and add a unit breakdown section to SystemInfoModal.

---

## Problem

Mechs are tracked in `game_player_units` and participate in production and combat, but are invisible on the map. The hex tile badge shows only infantry count, and `SystemInfoModal` shows only static tile data (planets, wormholes, anomalies) — no unit breakdown at all.

---

## Goals

- Mech counts appear in the HexTile ground-force badge alongside infantry.
- SystemInfoModal gains a live unit section: space area ships + per-planet ground forces (including mechs), grouped by player.
- No backend changes — all data is already in `systemUnits` flowing through `GalaxyTab`.
- Mech badge abbreviation is gated on `game.expansions?.pok`.

---

## Rules Basis

LRR §55.1: "Mechs are a type of ground force." They are placed on planets, transported, and participate in ground combat — identical to infantry in terms of board placement. Visualizing them alongside infantry on the tile is correct.

---

## Architecture

No new data fetching. The existing pipeline already provides everything needed:

```
useGalaxy → systemUnits (all units, realtime)
GalaxyTab receives systemUnits, players, game
  → HexMap → HexTile   (badge: pokEnabled prop threaded down)
  → SystemInfoModal     (new: systemUnits + players props)
```

---

## File Map

| File | Change | Spec home |
|------|--------|-----------|
| `src/components/game/HexTile.jsx` | Badge: infantry-only → `2I 1M` abbreviations; add `pokEnabled` prop | Phase 34 spec (update) |
| `src/components/game/HexMap.jsx` | Thread `pokEnabled` prop to each `HexTile` | Phase 34 spec (update) |
| `src/components/game/GalaxyTab.jsx` | Derive `pokEnabled`; pass to `HexMap`; pass filtered `systemUnits` + `players` to `SystemInfoModal` | Phase 35 spec |
| `src/components/game/SystemInfoModal.jsx` | Add "UNITS" section with space area + per-planet breakdown | Phase 35 spec |

---

## Component Details

### `HexTile.jsx` (Phase 34 spec update)

Add `pokEnabled` prop (default `false`). Replace the `infantryCount` badge:

```js
const infantryCount = units
  .filter(u => u.unit_type === 'infantry')
  .reduce((s, u) => s + (u.count ?? 0), 0)

const mechCount = pokEnabled
  ? units.filter(u => u.unit_type === 'mech').reduce((s, u) => s + (u.count ?? 0), 0)
  : 0

const badgeParts = []
if (infantryCount > 0) badgeParts.push(`${infantryCount}I`)
if (mechCount > 0) badgeParts.push(`${mechCount}M`)
const badgeText = badgeParts.join(' ')
```

Badge renders only when `badgeText` is non-empty. The `<rect>` width: `Math.max(20, badgeText.length * 5.5 + 6)`, centered at `x=0`.

### `HexMap.jsx` (Phase 34 spec update)

Add `pokEnabled` prop (default `false`). Pass it to each `<HexTile pokEnabled={pokEnabled} ... />`.

### `GalaxyTab.jsx` (Phase 35)

Derive `pokEnabled` from the `game` prop already available:

```js
const pokEnabled = game?.expansions?.pok ?? false
```

Pass to `HexMap`:
```jsx
<HexMap pokEnabled={pokEnabled} ... />
```

When rendering `SystemInfoModal` (keyed by `infoSystemKey`), pass:
```jsx
<SystemInfoModal
  systemUnits={systemUnits.filter(u => u.system_key === infoSystemKey)}
  players={players}
  ...
/>
```

### `SystemInfoModal.jsx` (Phase 35)

New props: `systemUnits` (array, default `[]`) and `players` (array, default `[]`).

**Unit abbreviations** (local const):

```js
const ABBREV = {
  carrier: 'C', cruiser: 'Cr', destroyer: 'De', dreadnought: 'Dr',
  fighter: 'F', flagship: 'Fl', war_sun: 'W', space_dock: 'SD',
  infantry: 'I', mech: 'M', pds: 'P',
}
```

**Helper** — format a unit row for one player in one zone:

```js
function unitLine(units) {
  return units
    .filter(u => u.count > 0)
    .map(u => `${u.count}${ABBREV[u.unit_type] ?? u.unit_type}`)
    .join('  ')
}
```

**Layout** (added below anomalies, above Close button):

```
UNITS

Space Area
  ● [blue]  2C  1Dr  3F
  ● [red]   1W  2C

Mecatol Rex
  ● [blue]  2I  1M

Jord
  ● [red]   3I
```

- **Space Area section:** units where `on_planet === null`. Omit if no space units.
- **Per-planet sections:** one per planet in `tileInfo.planets` order. Omit planets with no units.
- **Player rows:** `players` array order; colored circle (`inline-block w-2 h-2 rounded-full`) matching `player.colour`.
- **Entire UNITS section omitted** if `systemUnits` is empty or not provided.

---

## Unit Abbreviation Table

Shared convention across Phase 34 (UnitTooltip) and Phase 35 (SystemInfoModal):

| DB value | Abbrev |
|----------|--------|
| carrier | C |
| cruiser | Cr |
| destroyer | De |
| dreadnought | Dr |
| fighter | F |
| flagship | Fl |
| war_sun | W |
| space_dock | SD |
| infantry | I |
| mech | M |
| pds | P |

---

## What Is Not Changing

- `useGalaxy.js` — no new queries
- All edge functions and DB schema — untouched
- `HexMap` SVG dimensions — badge width adjusts, overall layout unchanged
- `SystemInfoModal` static sections (planets, wormholes, anomalies) — untouched

---

## Tests

**HexTile badge (added to Phase 34 HexTile test file):**
1. Badge shows `2I` when infantry present and `pokEnabled=false`.
2. Badge shows `2I 1M` when infantry and mech both present and `pokEnabled=true`.
3. Badge omits `M` when mechs exist but `pokEnabled=false`.
4. Badge hidden when no ground forces present.

**SystemInfoModal:**
5. Renders "UNITS" section with space area ships grouped by player with colored dots.
6. Renders per-planet ground forces (including mechs) under the planet name.
7. Omits planets with no units from the UNITS section.
8. Omits entire UNITS section when `systemUnits` is empty.
9. Omits entire UNITS section when `systemUnits` prop is not provided.

---

## Phase Label

**Phase 35 — Mech Plastic Unit Visualization**
