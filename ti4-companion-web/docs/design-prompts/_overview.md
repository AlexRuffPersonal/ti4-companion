# TI4 Companion — Icon Design Prompts

Prompts are written for Claude Design. Each section in the category files contains a filename header followed by a single paste-ready paragraph.

## Colour Strategy

| Category | Colour approach | Reason |
|----------|----------------|--------|
| Ships & ground units | White (#ffffff) silhouette | CSS-tinted at runtime to faction colour |
| Technology | Category colour (green/amber/blue/red) | Fixed per tech tree — colour IS the signal |
| Command tokens | White outer ring, accent motif | Ring tinted to faction; motif stays distinct |
| Planet stats | Category colour (gold/blue) | Matches physical TI4 tile printing |
| Leaders | Category colour (blue/gold/red) | Fixed per leader type |
| Status indicators | State colour (green/amber/red/grey) | Colour reinforces state meaning |
| Economy | Gold or steel | Matches physical token appearance |
| Phases | Phase colour (blue/amber/green/gold) | Fixed per phase |
| Dice | Pale steel | Neutral — result panels apply state colour |

## App Palette Reference

| Token | Hex |
|-------|-----|
| White (unit silhouettes) | `#ffffff` |
| Gold | `#d4a017` |
| Blue (plasma) | `#58a6ff` |
| Red (danger) | `#f85149` |
| Amber (warning) | `#e3b341` |
| Green (success) | `#3fb950` |
| Steel (text) | `#c9d1d9` |
| Dim (inactive) | `#6e7681` |

## File Destination

`ti4-companion-web/public/icons/` — subdirectory per category.

## Prompt Files

| File | Category | Icons |
|------|----------|-------|
| [units.md](units.md) | Ships & ground units | carrier, cruiser, destroyer, dreadnought, fighter, flagship, war-sun, pds, space-dock, infantry, mech |
| [technology.md](technology.md) | Tech categories | biotic, cybernetic, propulsion, warfare |
| [tokens.md](tokens.md) | Command tokens | tactic, fleet, strategy |
| [planet-stats.md](planet-stats.md) | Planet values | resource, influence |
| [leaders.md](leaders.md) | Leader types | agent, commander, hero |
| [status.md](status.md) | State indicators | ready, exhausted, damaged, purged |
| [economy.md](economy.md) | Game economy | trade-good, commodity, victory-point |
| [phases.md](phases.md) | Game phases | strategy-phase, action-phase, status-phase, agenda-phase |
| [dice.md](dice.md) | Combat dice | d10 |
