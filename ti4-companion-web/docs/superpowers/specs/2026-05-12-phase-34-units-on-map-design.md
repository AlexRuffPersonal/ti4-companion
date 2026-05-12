# Phase 34 — Units on Map Visualization

**Date:** 2026-05-12
**Feature area:** Galaxy Map — Hex Tile Unit Overlays
**Scope:** Desktop hover tooltip showing per-player, per-unit-type counts for space area and each planet in a system.

---

## Problem

All unit data is tracked in `game_player_units` and updated in real time, but hex tiles in `GalaxyTab` show no unit breakdown. Players must tap a tile and open the system modal to see what's there. A hover tooltip on desktop gives an instant read without leaving the map view.

---

## Goals

- Show per-player unit counts broken down by unit type on hover.
- Space-area units and per-planet ground forces are shown in separate sections.
- No backend changes — all required data is already available in `HexMap` props.
- Mobile / touch unaffected (feature is hover-only).

---

## Architecture

No new data fetching. The existing pipeline already provides everything:

```
useGalaxy → systemUnits (all units, realtime)
         → tileData    (planet names per tile)
         → players     (colours)
HexMap receives all three → filters tileUnits per hex → passes to HexTile
```

Three files change:

| File | Change |
|------|--------|
| `src/components/game/HexTile.jsx` | Add `onMouseEnter(systemKey)` / `onMouseLeave` props |
| `src/components/game/HexMap.jsx` | Wrap SVG in relative div; track hover state; render `UnitTooltip` |
| `src/components/game/UnitTooltip.jsx` | New component — tooltip display only |

---

## Component Details

### `HexTile.jsx`

Add optional `onMouseEnter` / `onMouseLeave` props (default no-op). Wire to the root `<g>`:

```jsx
<g
  onClick={() => onSelect(systemKey)}
  onMouseEnter={() => onMouseEnter?.(systemKey)}
  onMouseLeave={() => onMouseLeave?.()}
  style={{ cursor: 'pointer' }}
>
```

No other changes. The existing infantry badge is kept.

### `HexMap.jsx`

Wrap the `<svg>` in a `<div className="relative w-full h-full">`. Track hover state:

```js
const [hover, setHover] = useState(null)
// hover = { systemKey, x, y } | null
```

- `HexTile` receives `onMouseEnter={(key) => setHover(prev => ({ ...prev, systemKey: key }))}` and `onMouseLeave={() => setHover(null)}`.
- The wrapper `<div>` receives `onMouseMove={(e) => setHover(prev => prev ? { ...prev, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY } : null)}` and `onMouseLeave={() => setHover(null)}`.
- When `hover` is set, render `<UnitTooltip>` absolutely positioned at `{ left: hover.x + 12, top: hover.y + 12 }`.

Pass `UnitTooltip` the `units` pre-filtered to the hovered system key (same `tileUnits` already computed in the map loop), the `tileInfo` for planet names, and `players`.

### `UnitTooltip.jsx`

Pure display component. Props: `units`, `tileInfo`, `players`, `style`.

**Unit abbreviations** (defined locally):

| DB value | Abbrev |
|----------|--------|
| carrier | C |
| cruiser | Cr |
| destroyer | D |
| dreadnought | Dr |
| fighter | F |
| flagship | Fl |
| war_sun | W |
| space_dock | SD |
| infantry | I |
| mech | M |
| pds | P |

**Layout:**

```
Space Area
  ● [blue] 2C  1Dr  3F
  ● [red]  1W  2C

Mecatol Rex
  ● [blue] 2I  1M

Jord
  ● [red]  3I  1P
```

- Sections with no units are omitted entirely.
- If the entire `units` array is empty, render a single "No units" line (prevents tooltip flash).
- Player rows shown in `players` array order; player color shown as a small colored circle.
- Uses existing `.panel`, `.label`, `.text-dim` Tailwind classes.
- `position: absolute`, `z-index: 50`, `pointer-events: none`, `max-width: 200px`.

---

## What Is Not Changing

- `useGalaxy.js` — no new queries
- `GalaxyTab.jsx` — no changes
- All edge functions and DB schema — untouched
- Mobile interaction — tap still opens `SystemActionModal` as before

---

## Tests

All in Vitest + Testing Library:

1. `UnitTooltip` renders space units grouped by player with correct abbreviations.
2. `UnitTooltip` renders per-planet ground forces in separate named sections.
3. `UnitTooltip` omits sections that have no units.
4. `UnitTooltip` renders "No units" when the units array is empty.
5. `HexTile` calls `onMouseEnter` with the correct `systemKey` on mouse enter.
6. `HexTile` calls `onMouseLeave` on mouse leave.

---

## Phase Label

**Phase 34 — Units on Map Visualization**
