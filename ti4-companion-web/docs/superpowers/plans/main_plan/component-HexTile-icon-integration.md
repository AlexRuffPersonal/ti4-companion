# component-HexTile-icon-integration
**File:** `src/components/game/HexTile.jsx`
**Status:** Modify
**Prereqs:** component-GameIcon

## Functionality
```
Remove: infantryCount, mechCount, badgeParts, badgeText, badgeWidth + badge <g> render block

Add: space unit aggregation
  spaceUnitCounts = {} // { unit_type: totalCount }
  for each unit where on_planet == null:
    spaceUnitCounts[unit_type] += count

Add: per-planet ground aggregation
  groundByPlanet = {} // { planetName: { infantry: N, mech: N } }
  for each unit where on_planet != null:
    if unit_type === 'infantry' OR (pokEnabled && unit_type === 'mech'):
      groundByPlanet[on_planet][unit_type] += count
  groundEntries = Object.entries(groundByPlanet).filter(entries have > 0 counts)

Render space units row (if any space units):
  y_space = size * 0.30
  <rect x={-size*0.8} y={y_space} width={size*1.6} height={14} rx={2} />
  for each [type, count] in Object.entries(spaceUnitCounts):
    <SvgImageIcon category="units" name={type} x={x_offset} y={y_space+1} size={12}
                  data-testid={`space-unit-icon-${type}`} />
    <text x={x_offset+14} ...>×{count}</text>
    x_offset += 26

Render per-planet ground boxes (one per planet in groundEntries):
  for each [planetName, counts] at index i:
    y_ground = y_space + 16 + i * 16
    <rect x={-size*0.75} y={y_ground} width={size*1.5} height={13} rx={2} />
    <text x={-size*0.73} y={y_ground+9} fontSize={7} fill={dim}>{planetName}</text>
    if counts.infantry:
      <SvgImageIcon category="units" name="infantry" x={0} y={y_ground+1} size={10}
                    data-testid={`ground-unit-icon-infantry-${planetName}`} />
      <text x={13} y={y_ground+9}>×{counts.infantry}</text>
    if counts.mech:
      <SvgImageIcon category="units" name="mech" x={22} y={y_ground+1} size={10}
                    data-testid={`ground-unit-icon-mech-${planetName}`} />
      <text x={35} y={y_ground+9}>×{counts.mech}</text>
```

## Tests
```
renders space-unit-icon-carrier when carrier present in space
renders space-unit-icon-fighter for fighters in space
renders ground-unit-icon-infantry-{planetName} for infantry on that planet
renders ground-unit-icon-mech-{planetName} for mech on that planet (pokEnabled)
does NOT render mech ground icon when pokEnabled=false
does NOT render space unit row when no space units
does NOT render ground box when no ground units
old text badge ("4I", "2I 1M") no longer present
multiple planets get separate ground boxes (two different data-testid planetNames)
```
