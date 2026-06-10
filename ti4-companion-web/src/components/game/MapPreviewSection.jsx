const HEX_SIZE = 60
const POLYGON_SIZE = 56

function axialToPixel(q, r) {
  const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r)
  const y = HEX_SIZE * (3 / 2 * r)
  return { x, y }
}

function hexPoints(size) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    pts.push(`${size * Math.sin(angle)},${-size * Math.cos(angle)}`)
  }
  return pts.join(' ')
}

const POINTS = hexPoints(POLYGON_SIZE)

function HexTilePreview({ systemKey, tileNumber, rotation = 0 }) {
  const [q, r] = systemKey.split(',').map(Number)
  const { x, y } = axialToPixel(q, r)
  const transform =
    rotation > 0
      ? `translate(${x},${y}) rotate(${rotation * 60},0,0)`
      : `translate(${x},${y})`

  return (
    <g transform={transform}>
      <polygon
        points={POINTS}
        fill="#1a2035"
        stroke="#334"
        strokeWidth="1"
      />
      <text
        x="0"
        y="0"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#8899aa"
        fontSize="10"
      >
        {tileNumber}
      </text>
    </g>
  )
}

import { memo } from 'react'

function MapPreviewSection({ mapTiles, tileByNumber = {} }) {
  if (!mapTiles || Object.keys(mapTiles).length === 0) {
    return <p className="text-muted text-xs">No map configured</p>
  }

  return (
    <svg
      viewBox="-350 -350 700 700"
      style={{ width: '100%', height: '100%' }}
      className="touch-none"
    >
      <HexTilePreview systemKey="0,0" tileNumber="18" rotation={0} />
      {Object.entries(mapTiles).map(([sk, ref]) => (
        <HexTilePreview
          key={sk}
          systemKey={sk}
          tileNumber={String(ref.tile_number)}
          rotation={ref.rotation ?? 0}
          tileInfo={tileByNumber[ref.tile_number]}
        />
      ))}
    </svg>
  )
}

export default memo(MapPreviewSection)
