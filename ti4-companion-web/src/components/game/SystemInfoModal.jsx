import GameIcon from '../shared/GameIcon.jsx'

const UNIT_ABBREV = {
  carrier: 'C', cruiser: 'Cr', destroyer: 'D', dreadnought: 'Dr',
  fighter: 'F', flagship: 'Fl', war_sun: 'W', space_dock: 'SD',
  infantry: 'I', mech: 'M', pds: 'P',
}

function unitLine(units) {
  return units
    .filter(u => (u.count ?? 0) > 0)
    .map(u => `${u.count}${UNIT_ABBREV[u.unit_type] ?? u.unit_type}`)
    .join('  ')
}

export default function SystemInfoModal({ tileInfo, systemKey, onClose, systemUnits = [], players = [] }) {
  const planets = tileInfo?.planets ?? []
  const wormholes = tileInfo?.wormholes ?? []
  const anomalies = tileInfo?.anomalies ?? []

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label">{'SYSTEM ' + systemKey}</p>

        {planets.map(p => (
          <div key={p.name} className="flex flex-col gap-0.5 py-1 border-b border-border last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-text font-body">{p.name}</span>
              <span className="text-muted text-xs">{p.resources}/{p.influence}</span>
              {p.tech_specialty &&
                <span className={`text-xs px-1 rounded font-mono tech-chip-${p.tech_specialty}`}>
                  {p.tech_specialty[0].toUpperCase()}
                </span>
              }
            </div>
            {(p.type ?? []).length > 0 &&
              <div className="flex gap-1 items-center">
                {p.type.map(t => (
                  <span key={t} className="flex items-center gap-1 text-dim text-xs font-body uppercase">
                    <GameIcon category="planet" name={t} size={12} alt={t} />
                    {t}
                  </span>
                ))}
              </div>
            }
          </div>
        ))}

        {wormholes.length > 0 && (
          <div>
            <p className="label">WORMHOLES</p>
            <p className="text-muted text-xs">{wormholes.join(', ')}</p>
          </div>
        )}

        {anomalies.length > 0 && (
          <div>
            <p className="label">ANOMALIES</p>
            <p className="text-muted text-xs">{anomalies.join(', ')}</p>
          </div>
        )}

        {systemUnits.length > 0 && (
          <div>
            <p className="label">UNITS</p>

            {(() => {
              const spaceUnits = systemUnits.filter(u => u.on_planet == null)
              const spaceRows = players
                .map(pl => ({ player: pl, units: spaceUnits.filter(u => u.player_id === pl.id) }))
                .filter(r => r.units.length > 0)
              return spaceRows.length > 0 ? (
                <div className="mb-2">
                  <p className="text-dim text-xs mb-1">Space Area</p>
                  {spaceRows.map(r => (
                    <div key={r.player.id} className="flex items-center gap-2">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: r.player.colour }} />
                      <span className="text-muted text-xs font-mono">{unitLine(r.units)}</span>
                    </div>
                  ))}
                </div>
              ) : null
            })()}

            {planets.map(planet => {
              const planetUnits = systemUnits.filter(u => u.on_planet === planet.name)
              const rows = players
                .map(pl => ({ player: pl, units: planetUnits.filter(u => u.player_id === pl.id) }))
                .filter(r => r.units.length > 0)
              return rows.length > 0 ? (
                <div key={planet.name} className="mb-2">
                  <p className="text-dim text-xs mb-1">{planet.name}</p>
                  {rows.map(r => (
                    <div key={r.player.id} className="flex items-center gap-2">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: r.player.colour }} />
                      <span className="text-muted text-xs font-mono">{unitLine(r.units)}</span>
                    </div>
                  ))}
                </div>
              ) : null
            })}
          </div>
        )}

        <button className="btn-ghost text-xs w-full mt-2" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  )
}
