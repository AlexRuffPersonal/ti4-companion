import { useState } from 'react'

// Ground force unit types that need a planet destination
const GROUND_FORCE_TYPES = new Set(['infantry', 'mech'])

export default function ProductionModal({
  gameId,
  systemKey,
  systemUnits,
  myPlayerId,
  myPlanets,
  unitDefs,
  onProduce,
  onClose,
}) {
  const [selectedUnits, setSelectedUnits] = useState({})       // { unit_type: count }
  const [exhaustedPlanets, setExhaustedPlanets] = useState([]) // list of planet_name strings
  const [groundPlanetMap, setGroundPlanetMap] = useState({})   // { unit_type: planet_name }

  // Compute capacity from production-capable units owned by this player
  const productionUnits = systemUnits.filter(
    u => u.player_id === myPlayerId && unitDefs[u.unit_type]?.production
  )
  const totalCapacity = productionUnits.reduce(
    (sum, u) => sum + parseInt(unitDefs[u.unit_type].production),
    0
  )

  // Buildable unit types: those with a non-null cost
  const buildableUnits = Object.entries(unitDefs).filter(([, def]) => def.cost != null)

  // Derived totals
  const totalSelected = Object.values(selectedUnits).reduce((s, c) => s + c, 0)
  const totalCost = buildableUnits.reduce((sum, [type, def]) => {
    return sum + (parseInt(def.cost) * (selectedUnits[type] ?? 0))
  }, 0)
  const totalResources = exhaustedPlanets.reduce((sum, name) => {
    const planet = myPlanets.find(p => p.planet_name === name)
    return sum + (planet?.resources ?? 0)
  }, 0)

  const canProduce =
    totalSelected > 0 &&
    totalSelected <= totalCapacity &&
    totalResources >= totalCost

  function increment(type) {
    setSelectedUnits(prev => ({ ...prev, [type]: (prev[type] ?? 0) + 1 }))
    // Default planet assignment for ground forces
    if (GROUND_FORCE_TYPES.has(type) && !groundPlanetMap[type] && myPlanets.length > 0) {
      setGroundPlanetMap(prev => ({ ...prev, [type]: myPlanets[0].planet_name }))
    }
  }

  function decrement(type) {
    setSelectedUnits(prev => {
      const next = { ...prev, [type]: Math.max(0, (prev[type] ?? 0) - 1) }
      if (next[type] === 0) delete next[type]
      return next
    })
  }

  function togglePlanet(planetName) {
    setExhaustedPlanets(prev =>
      prev.includes(planetName)
        ? prev.filter(n => n !== planetName)
        : [...prev, planetName]
    )
  }

  function handleProduce() {
    onProduce({
      systemKey,
      units: { ...selectedUnits },
      planet_exhausts: [...exhaustedPlanets],
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel lg max-w-lg w-full mx-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <p className="label">PRODUCTION</p>
        <p className="text-muted text-sm font-body">
          Capacity: {totalSelected}/{totalCapacity} units
        </p>

        {/* Unit picker */}
        <div className="flex flex-col gap-3">
          {buildableUnits.map(([type, def]) => {
            const count = selectedUnits[type] ?? 0
            const isGroundForce = GROUND_FORCE_TYPES.has(type)
            return (
              <div key={type} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-bright font-body capitalize">{type}</span>
                    <span className="text-dim text-xs font-body ml-2">Cost: {def.cost}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="counter-btn"
                      onClick={() => decrement(type)}
                      disabled={count === 0}
                    >
                      −
                    </button>
                    <span className="font-display text-bright text-sm w-6 text-center">{count}</span>
                    <button
                      className="counter-btn"
                      onClick={() => increment(type)}
                    >
                      +
                    </button>
                  </div>
                </div>
                {isGroundForce && count > 0 && (
                  <div className="panel-inset flex items-center gap-2">
                    <label
                      className="label text-xs"
                      htmlFor={`planet-picker-${type}`}
                    >
                      Planet for {type}
                    </label>
                    <select
                      id={`planet-picker-${type}`}
                      aria-label={`Planet for ${type}`}
                      className="input text-xs flex-1"
                      value={groundPlanetMap[type] ?? (myPlanets[0]?.planet_name ?? '')}
                      onChange={e =>
                        setGroundPlanetMap(prev => ({ ...prev, [type]: e.target.value }))
                      }
                    >
                      {myPlanets.map(p => (
                        <option key={p.planet_name} value={p.planet_name}>
                          {p.planet_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Planet exhaust picker */}
        <div className="flex flex-col gap-2">
          <p className="label">EXHAUST PLANETS TO PAY</p>
          <p className="text-muted text-sm font-body">
            Resources: {totalResources}/{totalCost}
          </p>
          {myPlanets.map(planet => {
            const isExhausted = exhaustedPlanets.includes(planet.planet_name)
            return (
              <button
                key={planet.planet_name}
                className={`flex items-center justify-between text-sm font-body px-2 py-1 rounded ${
                  isExhausted
                    ? 'panel-inset text-dim line-through'
                    : 'text-text hover:text-bright'
                }`}
                onClick={() => togglePlanet(planet.planet_name)}
              >
                <span>{planet.planet_name}</span>
                <span className="text-muted text-xs">{planet.resources} res</span>
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>
            CANCEL
          </button>
          <button
            className="btn-primary"
            disabled={!canProduce}
            onClick={handleProduce}
          >
            PRODUCE
          </button>
        </div>
      </div>
    </div>
  )
}
