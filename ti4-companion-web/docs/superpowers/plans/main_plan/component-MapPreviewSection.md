# component-MapPreviewSection

**File:** `src/components/game/MapPreviewSection.jsx`
**Status:** New
**Prereqs:** lib-mapParser

## Functionality

```jsx
// Props:
//   mapTiles: Record<string, { tile_id?, tile_number, rotation? }>
//   tileByNumber: Record<string, { id, wormhole, tile_number }> (fetched in LobbyScreen)
//
// Read-only hex map preview for lobby. Shows tile colours / numbers.
// Does not depend on useGalaxy or game state — lobby-only component.

export default function MapPreviewSection({ mapTiles, tileByNumber }) {
  if (!mapTiles || Object.keys(mapTiles).length === 0)
    return <p className="text-muted text-xs">No map configured</p>

  // Convert axial "q,r" → pixel x,y using same axialToPixel as HexMap.
  // Render SVG: one <HexTile>-like element per entry in mapTiles.
  // For tiles with rotation !== 0 (and undefined), wrap in <g transform="rotate(deg, cx, cy)">.
  //   rotation: 0–5 → degrees: rotation * 60

  return (
    <svg viewBox="-350 -350 700 700" style={{ width: '100%', height: '100%' }} className="touch-none">
      {/* Mecatol Rex always at 0,0 */}
      <HexTilePreview key="0,0" systemKey="0,0" tileNumber="18" rotation={0} />
      {Object.entries(mapTiles).map(([sk, ref]) => (
        <HexTilePreview
          key={sk}
          systemKey={sk}
          tileNumber={ref.tile_number}
          rotation={ref.rotation ?? 0}
          tileInfo={tileByNumber[ref.tile_number]}
        />
      ))}
    </svg>
  )
}

// HexTilePreview: inner helper. Renders a coloured hex + tile number label.
// Applies SVG rotate transform when rotation > 0.
```

## Tests

```js
// renders one SVG group per entry in mapTiles
// hyperlane tile with rotation=2 has transform="rotate(120, cx, cy)"
// tile with rotation=0 or absent has no rotation transform
// empty mapTiles → renders "No map configured" text, no SVG
// Mecatol Rex tile always rendered at "0,0"
```
