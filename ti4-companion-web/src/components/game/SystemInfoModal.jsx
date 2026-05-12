export default function SystemInfoModal({ tileInfo, systemKey, onClose }) {
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
              <div className="flex gap-1">
                {p.type.map(t => (
                  <span key={t} className="text-dim text-xs font-body uppercase">{t}</span>
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

        <button className="btn-ghost text-xs w-full mt-2" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  )
}
