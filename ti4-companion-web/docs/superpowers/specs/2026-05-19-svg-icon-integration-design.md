# SVG Icon Integration Design

**Date:** 2026-05-19

## Overview

Integrate the existing SVG icons from `public/icons/` into five UI locations: HexTile unit display, TechCard type indicator, command token display, planet resource/influence display, and LeaderCard type badge.

## Icon Rendering Approach

**Shared component:** `src/components/shared/GameIcon.jsx`

- Props: `category` (string), `name` (string), `size` (number, default 16), `className` (string), `alt` (string)
- Renders: `<img src={/icons/${category}/${name}.svg} width={size} height={size} alt={alt ?? name} className={className} />`
- Also exports `SvgImageIcon({ category, name, x, y, size })` for use inside SVG elements — renders `<image href={/icons/${category}/${name}.svg} x={x} y={y} width={size} height={size} />`

No build tooling changes needed. Icons ship with their baked-in game colours, which are correct by design.

Icon inventory used:

| Category | Names used |
|----------|-----------|
| `tech` | `biotic`, `propulsion`, `cybernetic`, `warfare` |
| `tokens` | `tactic`, `fleet`, `strategy` |
| `economy` | `commodity`, `trade-good` |
| `planet` | `resource`, `influence` |
| `leaders` | `agent`, `commander`, `hero` |
| `units` | `carrier`, `cruiser`, `destroyer`, `dreadnought`, `fighter`, `flagship`, `infantry`, `mech`, `pds`, `space-dock`, `war-sun` |

## Integration 1 — TechCard (`src/components/game/TechCard.jsx`)

**Change:** Replace the prereq dots block with a tech-type icon + label row.

Mapping from `tech.technology_type`:
- `green` → `biotic` (stroke `#3fb950`)
- `blue` → `propulsion` (stroke `#58a6ff`)
- `yellow` → `cybernetic` (stroke `#e3b341`)
- `red` → `warfare` (stroke `#f85149`)
- `unit_upgrade` → no icon rendered

The missing-prereq tooltip text (`Missing: N colour`) is unchanged — it still appears for `unavailable` techs. The dots were the only element removed.

## Integration 2 — Command Token Display (`src/components/game/MyPanelSection.jsx`)

**Change:** In the token/resource counter row, insert a `GameIcon` between the text label and the number for all five counters.

| Counter | Category | Name |
|---------|----------|------|
| TACTIC | `tokens` | `tactic` |
| FLEET | `tokens` | `fleet` |
| STRATEGY | `tokens` | `strategy` |
| COMMOD. | `economy` | `commodity` |
| TRADE | `economy` | `trade-good` |

Icon size: 22px. Label text stays above, number stays below.

## Integration 3 — Planet List (`src/components/game/MyPanelSection.jsx`)

**Change:** Replace the `{resources}/{influence}` text span with two `<GameIcon>` + number pairs.

- Resource: `<GameIcon category="planet" name="resource" size={12} />` + number
- Influence: `<GameIcon category="planet" name="influence" size={12} />` + number
- When the planet is exhausted, the icon+number pairs inherit the existing `text-dim` / reduced-opacity styling of the parent row.

Tech specialty chip and trait labels are unchanged.

## Integration 4 — LeaderCard (`src/components/game/LeaderCard.jsx`)

**Change:** Replace the plain text `typeBadge` span content with a `GameIcon` + uppercase label text in the same chip.

```
Before: <span className="label ...">agent</span>
After:  <span className="label ..."><GameIcon category="leaders" name={leader_type} size={12}/> AGENT</span>
```

Applies to all three leader types: `agent`, `commander`, `hero`. The `isMech` path has no type badge and is unchanged.

## Integration 5 — HexTile (`src/components/game/HexTile.jsx`)

**Change:** Replace the single `badgeText` ground-forces badge with two new elements:

### Space units row
A single SVG `<g>` rendered just above the planet list area. For each unique `unit_type` present in space (i.e. `on_planet === null`), render one `SvgImageIcon` (12×12) + a `×N` count text, laid out horizontally inside a background rect.

### Per-planet ground force boxes
For each planet that has at least one infantry or mech unit, render a separate ground-force box below the space units row. Each box shows:
- Planet name label (small, dim)
- Infantry `SvgImageIcon` + `×N` count (if any)
- Mech `SvgImageIcon` + `×N` count (if any, and only when `pokEnabled`)

The existing `badgeParts` / `badgeText` / `badgeWidth` logic is removed.

### Layout sizing
The HexTile SVG content area expands slightly downward when both rows are present. The two new rows occupy approximately 30px of vertical space below the planet dots. The outer `<g>` click target and `hexPolygonPoints` are unchanged.

## Tests

- `GameIcon` renders an `<img>` with the correct `src` path and dimensions
- `SvgImageIcon` renders an `<image>` with the correct `href`
- `TechCard` renders a `GameIcon` for typed techs; renders nothing in the dot area for `unit_upgrade`
- `TechCard` still shows the missing-prereq text for unavailable techs
- `MyPanelSection` renders token icons between labels and numbers
- `MyPanelSection` planet list renders resource and influence icons
- `LeaderCard` renders the correct leader icon alongside the type label
- `HexTile` renders space-unit icons for each unit type present in space
- `HexTile` renders a per-planet ground-force box for each planet with infantry or mech
- `HexTile` does not render the old text badge
