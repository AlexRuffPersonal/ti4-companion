const ABBREV = {
  carrier: 'C', cruiser: 'Cr', destroyer: 'D', dreadnought: 'Dr',
  fighter: 'F', flagship: 'Fl', war_sun: 'W', space_dock: 'SD',
  infantry: 'I', mech: 'M', pds: 'P',
}

function groupByPlayer(units, players) {
  const byPlayer = {}
  for (const u of units) {
    if (!byPlayer[u.player_id]) byPlayer[u.player_id] = {}
    byPlayer[u.player_id][u.unit_type] = (byPlayer[u.player_id][u.unit_type] ?? 0) + (u.count ?? 0)
  }
  return players
    .filter(p => byPlayer[p.id])
    .map(p => ({
      player: p,
      counts: Object.entries(byPlayer[p.id])
        .filter(([, c]) => c > 0)
        .map(([type, count]) => ({ abbrev: ABBREV[type] ?? type, count })),
    }))
}

export default function UnitTooltip({ units = [], tileInfo, players = [], style }) {
  const sections = []

  const spaceUnits = units.filter(u => u.on_planet == null)
  if (spaceUnits.length > 0) {
    sections.push({ label: 'Space Area', rows: groupByPlayer(spaceUnits, players) })
  }

  for (const planet of (tileInfo?.planets ?? [])) {
    const planetUnits = units.filter(u => u.on_planet === planet.name)
    if (planetUnits.length > 0) {
      sections.push({ label: planet.name, rows: groupByPlayer(planetUnits, players) })
    }
  }

  return (
    <div className="panel text-xs pointer-events-none" style={style} data-testid="unit-tooltip">
      {sections.length === 0 ? (
        <span className="text-muted">No units</span>
      ) : (
        sections.map(section => (
          <div key={section.label} className="mb-1 last:mb-0">
            <p className="label text-xs">{section.label}</p>
            {section.rows.map(row => (
              <div key={row.player.id} className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: row.player.colour }} />
                <span>{row.counts.map(c => `${c.count}${c.abbrev}`).join(' ')}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
