# component-HexTile-p34
**File:** `src/components/game/HexTile.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
props: { ...existing..., onMouseEnter = noop, onMouseLeave = noop, pokEnabled = false }

// Wire to root <g>:
<g
  onClick={() => onSelect(systemKey)}
  onMouseEnter={() => onMouseEnter(systemKey)}
  onMouseLeave={() => onMouseLeave()}
  style={{ cursor: 'pointer' }}
>
  // ...existing children unchanged...

// Replace infantry-only badge with ground-force badge:
infantryCount = units.filter(u => u.unit_type === 'infantry').reduce((s, u) => s + u.count, 0)
mechCount = pokEnabled
  ? units.filter(u => u.unit_type === 'mech').reduce((s, u) => s + u.count, 0)
  : 0

badgeParts = []
IF infantryCount > 0: badgeParts.push(`${infantryCount}I`)
IF mechCount > 0:     badgeParts.push(`${mechCount}M`)
badgeText = badgeParts.join(' ')

IF badgeText non-empty:
  rectWidth = Math.max(20, badgeText.length * 5.5 + 6)
  <g transform={`translate(0,${size - 14})`}>
    <rect x={-rectWidth/2} y={-8} width={rectWidth} height={14} rx={3} ... />
    <text ...>{badgeText}</text>
  </g>
```

## Tests

```pseudocode
GIVEN HexTile with onMouseEnter spy
  mouse enter on <g>
  EXPECT onMouseEnter called with systemKey

GIVEN HexTile with onMouseLeave spy
  mouse leave on <g>
  EXPECT onMouseLeave called

GIVEN units=[{unit_type:'infantry',count:2}], pokEnabled=false
  EXPECT badge text '2I'

GIVEN units=[{unit_type:'infantry',count:2},{unit_type:'mech',count:1}], pokEnabled=true
  EXPECT badge text '2I 1M'

GIVEN units=[{unit_type:'mech',count:1}], pokEnabled=false
  EXPECT badge not rendered

GIVEN units=[] (no ground forces)
  EXPECT badge not rendered
```
