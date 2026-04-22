function hexPolygonPoints(size) {
  return [0, 60, 120, 180, 240, 300]
    .map(deg => {
      const rad = (deg * Math.PI) / 180
      return `${size * Math.cos(rad)},${size * Math.sin(rad)}`
    })
    .join(' ')
}

export default function HexTile({ systemKey, tileNumber, planets, activations, units, planetOwnership, players, onSelect, size = 60 }) {
  const spaceUnits = units.filter(u => u.on_planet === null || u.on_planet === undefined)
  const spacePlayerIds = [...new Set(spaceUnits.map(u => u.player_id))]
  let borderColour = '#4a5568'
  if (spacePlayerIds.length === 1) {
    const p = players.find(pl => pl.id === spacePlayerIds[0])
    borderColour = p?.colour ?? '#4a5568'
  }

  const infantryCount = units
    .filter(u => u.unit_type === 'infantry')
    .reduce((sum, u) => sum + (u.count ?? 0), 0)

  return (
    <g onClick={() => onSelect(systemKey)} style={{ cursor: 'pointer' }}>
      <polygon points={hexPolygonPoints(size)} fill="#1a202c" stroke={borderColour} strokeWidth={2} />

      <text x={0} y={-size + 14} textAnchor="middle" fill="#d4af37" fontSize={10} fontFamily="Orbitron,sans-serif">
        {tileNumber}
      </text>

      {planets.map((planet, i) => {
        const ownership = planetOwnership.get(planet.name)
        const dotFill = !ownership ? '#6b7280' : ownership.exhausted ? 'none' : '#22c55e'
        const dotStroke = !ownership ? '#6b7280' : '#22c55e'
        return (
          <g key={planet.name} transform={`translate(0,${-8 + i * 14})`}>
            <circle cx={-size * 0.35} cy={0} r={4} fill={dotFill} stroke={dotStroke} strokeWidth={1.5} />
            <text x={-size * 0.35 + 8} y={4} fontSize={8} fill="#cbd5e0" fontFamily="Rajdhani,sans-serif">
              {planet.name}
            </text>
          </g>
        )
      })}

      {activations.map((act, i) => {
        const p = players.find(pl => pl.id === act.player_id)
        return (
          <circle
            key={act.id}
            cx={size * 0.55 - i * 9}
            cy={-size * 0.55}
            r={6}
            fill={p?.colour ?? '#6b7280'}
            stroke="#1a202c"
            strokeWidth={1.5}
          />
        )
      })}

      {infantryCount > 0 && (
        <g transform={`translate(0,${size - 14})`}>
          <rect x={-10} y={-8} width={20} height={14} rx={3} fill="#1a202c" stroke="#4a5568" strokeWidth={1} />
          <text x={0} y={2} textAnchor="middle" fontSize={9} fill="#e2e8f0" fontFamily="Space Mono,monospace">
            {infantryCount}
          </text>
        </g>
      )}
    </g>
  )
}