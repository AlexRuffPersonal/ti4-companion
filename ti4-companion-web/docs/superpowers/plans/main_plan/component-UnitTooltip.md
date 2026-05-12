# component-UnitTooltip
**File:** `src/components/game/UnitTooltip.jsx`
**Status:** New
**Prereqs:** —

## Functionality

```pseudocode
props: { units, tileInfo, players, style }

ABBREV = {
  carrier:'C', cruiser:'Cr', destroyer:'D', dreadnought:'Dr',
  fighter:'F', flagship:'Fl', war_sun:'W', space_dock:'SD',
  infantry:'I', mech:'M', pds:'P'
}

// Build sections:
sections = []

// Space area section:
spaceUnits = units WHERE on_planet === null
IF spaceUnits.length > 0:
  spaceRows = groupByPlayer(spaceUnits, players)  // [{player, counts: [{abbrev, count}]}]
  sections.push({ label: 'Space Area', rows: spaceRows })

// Per-planet sections:
FOR planet IN (tileInfo?.planets ?? []):
  planetUnits = units WHERE on_planet === planet.name
  IF planetUnits.length > 0:
    rows = groupByPlayer(planetUnits, players)
    sections.push({ label: planet.name, rows })

// Render:
<div className="panel text-xs pointer-events-none" style={style} data-testid="unit-tooltip">
  IF sections.length === 0:
    MUTED("No units")
  ELSE:
    FOR section IN sections:
      LABEL(section.label)
      FOR row IN section.rows:
        <div className="flex items-center gap-1">
          <circle fill={row.player.colour} r=4 />
          <span>{row.counts.map(c => `${c.count}${c.abbrev}`).join(' ')}</span>
        </div>
```

`groupByPlayer(units, players)`: aggregate count per `unit_type` per `player_id`;
return only players who have ≥1 unit; preserve `players` array order.

## Tests

```pseudocode
GIVEN units with two players in space area
  EXPECT 'Space Area' section rendered
  EXPECT each player's unit abbreviations shown

GIVEN units with infantry on planet 'Mecatol Rex'
  EXPECT 'Mecatol Rex' section rendered
  EXPECT infantry abbreviation 'I' shown

GIVEN units only on planet, none in space
  EXPECT no 'Space Area' section rendered

GIVEN empty units array
  EXPECT 'No units' text rendered

GIVEN units with pds on planet
  EXPECT abbreviation 'P' shown
```
