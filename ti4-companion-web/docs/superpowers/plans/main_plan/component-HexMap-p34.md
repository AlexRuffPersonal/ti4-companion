# component-HexMap-p34
**File:** `src/components/game/HexMap.jsx`
**Status:** Modify
**Prereqs:** component-HexTile-p34, component-UnitTooltip

## Changes

```pseudocode
import UnitTooltip

// Add hover state:
const [hover, setHover] = useState(null)
// hover = { systemKey: string, x: number, y: number } | null

// Wrap existing <svg> in a relative div:
<div
  className="relative w-full h-full"
  onMouseMove={(e) => {
    IF hover !== null:
      setHover(prev => ({ ...prev, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }))
  }}
  onMouseLeave={() => setHover(null)}
>
  <svg ...existing props...>
    {entries.map(([key, tileEntry]) => {
      ...existing...
      <HexTile
        ...existing props...
        onMouseEnter={(k) => setHover({ systemKey: k, x: 0, y: 0 })}
        onMouseLeave={() => setHover(null)}
      />
    })}
  </svg>

  {hover && (() => {
    const tileEntry = mapTiles[hover.systemKey]
    const tileInfo = tileData[tileEntry?.tile_id] ?? null
    const tileUnits = systemUnits.filter(u => u.system_key === hover.systemKey)
    return (
      <UnitTooltip
        units={tileUnits}
        tileInfo={tileInfo}
        players={players}
        style={{ position: 'absolute', left: hover.x + 12, top: hover.y + 12, zIndex: 50 }}
      />
    )
  })()}
</div>
```

`onMouseMove` only updates x/y when a system is already hovered (avoids setting hover on mousemove with no system).
`onMouseEnter` from HexTile sets the systemKey; x/y initialise to 0 and are immediately corrected by the first mousemove.

## Tests

```pseudocode
GIVEN HexMap rendered with mapTiles, systemUnits, players
  mouse enter on a HexTile
  EXPECT UnitTooltip rendered in DOM

GIVEN UnitTooltip visible
  mouse leave on wrapper div
  EXPECT UnitTooltip removed from DOM
```
