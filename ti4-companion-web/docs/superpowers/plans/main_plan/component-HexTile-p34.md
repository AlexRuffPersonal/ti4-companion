# component-HexTile-p34
**File:** `src/components/game/HexTile.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
props: { ...existing..., onMouseEnter = noop, onMouseLeave = noop }

// Wire to root <g>:
<g
  onClick={() => onSelect(systemKey)}
  onMouseEnter={() => onMouseEnter(systemKey)}
  onMouseLeave={() => onMouseLeave()}
  style={{ cursor: 'pointer' }}
>
  // ...existing children unchanged...
```

No other changes. Existing infantry badge is kept.

## Tests

```pseudocode
GIVEN HexTile rendered with onMouseEnter spy
  mouse enter event on <g>
  EXPECT onMouseEnter called with systemKey

GIVEN HexTile rendered with onMouseLeave spy
  mouse leave event on <g>
  EXPECT onMouseLeave called
```
