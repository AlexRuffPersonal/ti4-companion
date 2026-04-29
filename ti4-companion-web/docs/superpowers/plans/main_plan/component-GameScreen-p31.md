# component-GameScreen-p31
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useGalaxy-p31, component-MyPanelSection-p31

## Changes

Thread `planetStaticMap` from `galaxyState` to `MyPanelSection`.

```pseudocode
// galaxyState already contains planetStaticMap (added in hook-useGalaxy-p31)
// GalaxyTab already receives it via {...galaxyState} spread — no change needed there

// Add to MyPanelSection:
<MyPanelSection
  ...existing props...
  planetStaticMap={galaxyState.planetStaticMap}
/>
```

`GalaxyTab` already receives `planetStaticMap` via the `{...galaxyState}` spread; no additional change needed for that path.

## Tests

```pseudocode
GIVEN galaxyState.planetStaticMap populated
  EXPECT MyPanelSection receives planetStaticMap prop
```
