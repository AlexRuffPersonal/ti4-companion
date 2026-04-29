# component-MyPanelSection-p31
**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** hook-useGalaxy-p31

## Changes

Add `planetStaticMap` prop. Expand each planet row to show inline stats.

```pseudocode
props: { ...existing..., planetStaticMap = {} }

// Replace existing planet row render:
{planets.map(planet => {
  const static = planetStaticMap[planet.planet_name]
  return (
    <div key={planet.id} className="flex items-center justify-between text-sm gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={planet.exhausted ? 'text-dim line-through' : 'text-text'}>
          {planet.planet_name}
        </span>
        {static && (
          <>
            <span className="text-muted text-xs shrink-0">
              {static.resources}/{static.influence}
            </span>
            {static.tech_specialty &&
              <span className={`text-xs px-1 rounded font-mono tech-chip-${static.tech_specialty}`}>
                {static.tech_specialty[0].toUpperCase()}
              </span>
            }
            {static.traits.map(t => (
              <span key={t} className="text-dim text-xs font-body uppercase shrink-0">{t}</span>
            ))}
          </>
        )}
      </div>
      <button
        className="label text-xs hover:text-text shrink-0"
        onClick={() => planet.exhausted ? onReadyPlanet(planet.planet_name) : onExhaustPlanet(planet.planet_name)}
      >
        {planet.exhausted ? 'READY' : 'EXHAUST'}
      </button>
    </div>
  )
})}
```

## Tests

```pseudocode
GIVEN planetStaticMap with entry for 'Welfor': { resources:2, influence:0, tech_specialty:'blue', traits:['cultural'] }
  planet row for 'Welfor':
    EXPECT '2/0' rendered
    EXPECT tech chip 'B' rendered
    EXPECT trait 'CULTURAL' rendered

GIVEN planetStaticMap with entry with no tech_specialty (null)
  EXPECT no tech chip rendered

GIVEN planetStaticMap with entry with empty traits
  EXPECT no trait labels rendered

GIVEN planetStaticMap={} (no entry for planet)
  EXPECT planet name and EXHAUST/READY button rendered, no crash

GIVEN planetStaticMap prop omitted
  EXPECT planet rows render as before, no crash

EXHAUST/READY button behaviour unchanged (existing tests still pass)
```
