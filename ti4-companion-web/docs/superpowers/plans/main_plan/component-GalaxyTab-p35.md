# component-GalaxyTab-p35
**File:** `src/components/game/GalaxyTab.jsx`
**Status:** Modify
**Prereqs:** component-HexMap-p34, component-SystemInfoModal-p35

## Changes

```pseudocode
// Derive pokEnabled from game prop (already available):
pokEnabled = game?.expansions?.pok ?? false

// Pass to HexMap:
<HexMap pokEnabled={pokEnabled} ...existing props... />

// Pass filtered units + players to SystemInfoModal (rendered when infoSystemKey is set):
<SystemInfoModal
  ...existing props...
  systemUnits={systemUnits.filter(u => u.system_key === infoSystemKey)}
  players={players}
/>
```

No new state, no new queries.

## Tests

```pseudocode
GIVEN GalaxyTab with game.expansions.pok=true
  EXPECT HexMap receives pokEnabled=true

GIVEN GalaxyTab with game.expansions.pok=false (or missing)
  EXPECT HexMap receives pokEnabled=false

GIVEN infoSystemKey set to a system that has units
  EXPECT SystemInfoModal receives systemUnits filtered to that system_key
  EXPECT SystemInfoModal receives players array
```
