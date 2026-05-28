import { SvgImageIcon } from '../shared/GameIcon.jsx'

function hexPolygonPoints(size) {
  return [0, 60, 120, 180, 240, 300]
    .map(deg => {
      const rad = (deg * Math.PI) / 180
      return `${size * Math.cos(rad)},${size * Math.sin(rad)}`
    })
    .join(' ')
}

export default function HexTile({ systemKey, tileNumber, planets, activations, units, planetOwnership, players, onSelect, onMouseEnter = () => {}, onMouseLeave = () => {}, pokEnabled = false, size = 60 }) {
  const spaceUnits = units.filter(u => u.on_planet === null || u.on_planet === undefined)
  const spacePlayerIds = [...new Set(spaceUnits.map(u => u.player_id))]
  let borderColour = '#4a5568'
  if (spacePlayerIds.length === 1) {
    const p = players.find(pl => pl.id === spacePlayerIds[0])
    borderColour = p?.colour ?? '#4a5568'
  }

  // Space unit aggregation
  const spaceUnitCounts = {}
  for (const unit of units.filter(u => u.on_planet === null || u.on_planet === undefined)) {
    if (!spaceUnitCounts[unit.unit_type]) spaceUnitCounts[unit.unit_type] = 0
    spaceUnitCounts[unit.unit_type] += unit.count ?? 0
  }

  // Per-planet ground aggregation
  const groundByPlanet = {}
  for (const unit of units.filter(u => u.on_planet != null)) {
    if (unit.unit_type === 'infantry' || (pokEnabled && unit.unit_type === 'mech')) {
      if (!groundByPlanet[unit.on_planet]) groundByPlanet[unit.on_planet] = { infantry: 0, mech: 0 }
      groundByPlanet[unit.on_planet][unit.unit_type] = (groundByPlanet[unit.on_planet][unit.unit_type] ?? 0) + (unit.count ?? 0)
    }
  }
  const groundEntries = Object.entries(groundByPlanet).filter(([, counts]) => counts.infantry > 0 || counts.mech > 0)

  const spaceUnitEntries = Object.entries(spaceUnitCounts)
  const hasSpaceUnits = spaceUnitEntries.length > 0

  const y_space = size * 0.30

  return (
    <g
      onClick={() => onSelect(systemKey)}
      onMouseEnter={() => onMouseEnter(systemKey)}
      onMouseLeave={() => onMouseLeave()}
      style={{ cursor: 'pointer' }}
    >
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

      {/* Space units row */}
      {hasSpaceUnits && (
        <g>
          <rect x={-size * 0.8} y={y_space} width={size * 1.6} height={14} rx={2} fill="#1a202c" fillOpacity={0.7} stroke="#4a5568" strokeWidth={1} />
          {(() => {
            let x_offset = -size * 0.78
            return spaceUnitEntries.map(([type, count]) => {
              const icon = (
                <g key={type}>
                  <SvgImageIcon category="units" name={type} x={x_offset} y={y_space + 1} size={12} data-testid={`space-unit-icon-${type}`} />
                  <text x={x_offset + 14} y={y_space + 10} fontSize={8} fill="#cbd5e0" fontFamily="Space Mono,monospace">×{count}</text>
                </g>
              )
              x_offset += 26
              return icon
            })
          })()}
        </g>
      )}

      {/* Per-planet ground boxes */}
      {groundEntries.map(([planetName, counts], i) => {
        const y_ground = y_space + 16 + i * 16
        return (
          <g key={planetName}>
            <rect x={-size * 0.75} y={y_ground} width={size * 1.5} height={13} rx={2} fill="#1a202c" fillOpacity={0.7} stroke="#4a5568" strokeWidth={1} />
            <text x={-size * 0.73} y={y_ground + 9} fontSize={7} fill="#6b7280" fontFamily="Rajdhani,sans-serif">{planetName}</text>
            {counts.infantry > 0 && (
              <>
                <SvgImageIcon category="units" name="infantry" x={0} y={y_ground + 1} size={10} data-testid={`ground-unit-icon-infantry-${planetName}`} />
                <text x={13} y={y_ground + 9} fontSize={8} fill="#cbd5e0" fontFamily="Space Mono,monospace">×{counts.infantry}</text>
              </>
            )}
            {counts.mech > 0 && (
              <>
                <SvgImageIcon category="units" name="mech" x={22} y={y_ground + 1} size={10} data-testid={`ground-unit-icon-mech-${planetName}`} />
                <text x={35} y={y_ground + 9} fontSize={8} fill="#cbd5e0" fontFamily="Space Mono,monospace">×{counts.mech}</text>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}
