# component-SystemInfoModal
**File:** `src/components/game/SystemInfoModal.jsx`
**Status:** New
**Prereqs:** hook-useGalaxy-p31

## Functionality

Pure display modal. No state mutations, no action buttons.

```pseudocode
props: { tileInfo, systemKey, onClose }
// tileInfo = tileData[tile_id] — { planets, wormholes, anomalies, type }

planets   = tileInfo?.planets ?? []
wormholes = tileInfo?.wormholes ?? []
anomalies = tileInfo?.anomalies ?? []

return (
  MODAL_WRAPPER
    PANEL(sm)
      LABEL('SYSTEM ' + systemKey)

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
          LABEL('WORMHOLES')
          <p className="text-muted text-xs">{wormholes.join(', ')}</p>
        </div>
      )}

      {anomalies.length > 0 && (
        <div>
          LABEL('ANOMALIES')
          <p className="text-muted text-xs">{anomalies.join(', ')}</p>
        </div>
      )}

      <button className="btn-ghost text-xs w-full mt-2" onClick={onClose}>CLOSE</button>
)
```

Tech chip colour classes (`tech-chip-green`, `tech-chip-blue`, `tech-chip-red`, `tech-chip-yellow`) map to existing Tailwind design tokens for the four tech colours.

## Tests

```pseudocode
GIVEN tileInfo with planet { name:'Welfor', resources:2, influence:0, tech_specialty:'blue', type:['cultural'] }
  EXPECT planet name 'Welfor' rendered
  EXPECT '2/0' rendered
  EXPECT tech chip with 'B' rendered
  EXPECT trait label 'CULTURAL' rendered

GIVEN tileInfo with wormholes=['alpha']
  EXPECT 'WORMHOLES' label and 'alpha' text rendered

GIVEN tileInfo with anomalies=['gravity_rift']
  EXPECT 'ANOMALIES' label and 'gravity_rift' text rendered

GIVEN tileInfo with empty wormholes and anomalies
  EXPECT no WORMHOLES or ANOMALIES sections rendered

GIVEN planet with no tech_specialty
  EXPECT no tech chip rendered

GIVEN planet with empty type array
  EXPECT no trait labels rendered

clicking CLOSE calls onClose
```
