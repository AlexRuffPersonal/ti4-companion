# component-SystemInfoModal-p35
**File:** `src/components/game/SystemInfoModal.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
props: { ...existing..., systemUnits = [], players = [] }

ABBREV = {
  carrier:'C', cruiser:'Cr', destroyer:'De', dreadnought:'Dr',
  fighter:'F', flagship:'Fl', war_sun:'W', space_dock:'SD',
  infantry:'I', mech:'M', pds:'P',
}

fn unitLine(units):
  return units
    .filter(u => u.count > 0)
    .map(u => `${u.count}${ABBREV[u.unit_type] ?? u.unit_type}`)
    .join('  ')

fn playerRows(zoneUnits):
  // group zoneUnits by player_id; render in players array order
  FOR each player IN players:
    playerZoneUnits = zoneUnits.filter(u => u.player_id === player.id)
    IF playerZoneUnits non-empty:
      line = unitLine(playerZoneUnits)
      render: colored dot (player.colour) + line

// Below anomalies section, above Close button:
IF systemUnits non-empty:
  LABEL('UNITS')

  spaceUnits = systemUnits.filter(u => on_planet === null)
  IF spaceUnits non-empty:
    render 'Space Area' subheading
    render playerRows(spaceUnits)

  FOR each planet IN tileInfo.planets:
    planetUnits = systemUnits.filter(u => u.on_planet === planet.name)
    IF planetUnits non-empty:
      render planet.name subheading
      render playerRows(planetUnits)
```

## Tests

```pseudocode
GIVEN systemUnits with space ships for two players
  EXPECT 'UNITS' section rendered
  EXPECT 'Space Area' subheading
  EXPECT each player row shows colored dot and correct abbreviations

GIVEN systemUnits with mech on planet 'Mecatol Rex'
  EXPECT planet section 'Mecatol Rex' rendered
  EXPECT row contains '1M'

GIVEN systemUnits with units only on planet A, not planet B
  EXPECT planet B section not rendered

GIVEN systemUnits=[]
  EXPECT 'UNITS' section not rendered

GIVEN systemUnits prop omitted
  EXPECT 'UNITS' section not rendered
```
