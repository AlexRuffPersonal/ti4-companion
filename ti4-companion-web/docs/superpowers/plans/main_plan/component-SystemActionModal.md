# component-SystemActionModal

**File:** `src/components/game/SystemActionModal.jsx`
**Status:** Modify
**Prereqs:** component-ProductionModal

## Changes

Add a "PRODUCE UNITS" button when the active system contains a caller-owned planet with a space dock:

```pseudocode
// Add to props:
props: { ..existing.., myPlanets, systemUnits, unitDefs, onOpenProduction }

// Derive: does this system have a caller-owned space dock?
systemPlanets = tileInfo?.planets ?? []
myPlanetsInSystem = myPlanets.filter(p => systemPlanets.some(sp => sp.name === p.planet_name))
hasSpaceDock = myPlanetsInSystem.some(p => p.space_dock_unit_id != null)

// Add button after the LAND ON buttons:
IF systemActivatedByMe AND hasSpaceDock AND isActivePlayer:
  <button className="btn-ghost w-full mb-2" onClick={() => onOpenProduction(systemKey)}>
    PRODUCE UNITS
  </button>
```

## Tests

```pseudocode
it('renders PRODUCE UNITS button when system activated by caller and has space dock')
it('does not render PRODUCE UNITS when system not activated')
it('does not render PRODUCE UNITS when caller has no space dock in system')
it('calls onOpenProduction with systemKey when clicked')
```
