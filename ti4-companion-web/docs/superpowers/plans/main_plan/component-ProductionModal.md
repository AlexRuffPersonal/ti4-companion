# component-ProductionModal

**File:** `src/components/game/ProductionModal.jsx`
**Status:** New
**Prereqs:** client-edgeFunctions

## Functionality

```pseudocode
props: { gameId, systemKey, systemUnits, myPlanets, unitDefs, onProduce, onClose }

-- Compute capacity from production-capable units in system
productionUnits = systemUnits.filter(u => u.player_id === myPlayerId && unitDefs[u.unit_type]?.production)
totalCapacity = sum PARSE_STAT(unitDef.production) for each productionUnit

-- State
[selectedUnits, setSelectedUnits] = useState({})   // { unit_type: count }
[exhaustedPlanets, setExhaustedPlanets] = useState([])
[groundPlanetMap, setGroundPlanetMap] = useState({}) // { unit_type: planet_name }

-- Derived
totalSelected = sum(selectedUnits values)
totalCost = sum(unitDef.cost * count for each selected unit)
totalResources = sum(planet.resources for each exhausted planet)
canProduce = totalSelected > 0 && totalSelected <= totalCapacity && totalResources >= totalCost

MODAL_WRAPPER
  PANEL(lg)
    LABEL("PRODUCTION")
    MUTED("Capacity: {totalSelected}/{totalCapacity} units")

    -- Unit picker
    FOR each buildable unit type (unitDefs where cost != null):
      render unit name, cost, +/− counters
      IF unit is ground force AND count > 0:
        render planet picker (planets in system with production units)

    -- Planet exhaust picker
    LABEL("EXHAUST PLANETS TO PAY")
    MUTED("Resources: {totalResources}/{totalCost}")
    FOR each unexhausted planet in myPlanets:
      render planet name + resource value; toggle to exhaust

    button btn-primary "PRODUCE" disabled={!canProduce}
      onClick → onProduce({ systemKey, units: [...], planet_exhausts: [...] })
    button btn-ghost "CANCEL" → onClose
```

## Tests

```pseudocode
it('computes totalCapacity from production stats of system units')
it('renders unit picker with cost labels')
it('disables PRODUCE when unit count exceeds capacity')
it('disables PRODUCE when resources < cost')
it('enables PRODUCE when count <= capacity and resources >= cost')
it('shows planet picker for ground forces when count > 0')
it('calls onProduce with correct payload on submit')
it('calls onClose on CANCEL')
```
