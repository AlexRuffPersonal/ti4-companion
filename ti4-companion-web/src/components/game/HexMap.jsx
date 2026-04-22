import HexTile from './HexTile.jsx'

const HEX_SIZE = 50

function axialToPixel(q, r) {
  const x = HEX_SIZE * (3 / 2) * q
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return { x, y }
}

export default function HexMap({ mapTiles, tileData, activations, systemUnits, planetOwnership, players, onSelectSystem }) {
  const entries = Object.entries(mapTiles)

  return (
    <svg viewBox="-350 -350 700 700" style={{ width: '100%', height: '100%' }} className="touch-none">
      {entries.map(([key, tileEntry]) => {
        const [q, r] = key.split(',').map(Number)
        const { x, y } = axialToPixel(q, r)
        const tileInfo = tileData[tileEntry.tile_id] ?? null
        const tileActivations = activations.filter(a => a.system_key === key)
        const tileUnits = systemUnits.filter(u => u.system_key === key)

        return (
          <g key={key} transform={`translate(${x},${y})`}>
            <HexTile
              systemKey={key}
              tileNumber={tileEntry.tile_number}
              planets={tileInfo?.planets ?? []}
              activations={tileActivations}
              units={tileUnits}
              planetOwnership={planetOwnership}
              players={players}
              onSelect={onSelectSystem}
              size={HEX_SIZE}
            />
          </g>
        )
      })}
    </svg>
  )
}