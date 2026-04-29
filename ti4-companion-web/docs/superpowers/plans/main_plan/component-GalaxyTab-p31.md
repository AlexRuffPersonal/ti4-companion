# component-GalaxyTab-p31
**File:** `src/components/game/GalaxyTab.jsx`
**Status:** Modify
**Prereqs:** hook-useGalaxy-p31, component-SystemInfoModal, component-SystemActionModal-p31

## Changes

```pseudocode
import SystemInfoModal

props: { ...existing..., planetStaticMap }

// Add state:
const [infoSystemKey, setInfoSystemKey] = useState(null)

// Pass onInfo to SystemActionModal:
<SystemActionModal
  ...existing props...
  onInfo={() => setInfoSystemKey(selectedSystemKey)}
/>

// Render SystemInfoModal when infoSystemKey is set:
{infoSystemKey && (
  <SystemInfoModal
    systemKey={infoSystemKey}
    tileInfo={tileData[mapTiles[infoSystemKey]?.tile_id] ?? null}
    onClose={() => setInfoSystemKey(null)}
  />
)}
```

`planetStaticMap` is received as a prop (spread from `galaxyState` in `GameScreen`) but is not used directly in `GalaxyTab` — it is threaded to `SystemInfoModal` which derives its own data from `tileInfo`. No further prop drilling needed.

## Tests

```pseudocode
GIVEN selectedSystemKey set and SystemActionModal visible
  clicking INFO button in SystemActionModal sets infoSystemKey
  EXPECT SystemInfoModal rendered with correct systemKey and tileInfo

GIVEN SystemInfoModal open
  clicking CLOSE calls setInfoSystemKey(null)
  EXPECT SystemInfoModal no longer rendered
```
