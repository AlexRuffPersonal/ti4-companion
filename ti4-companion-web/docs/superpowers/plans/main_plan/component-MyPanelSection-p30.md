# component-MyPanelSection-p30

**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** component-MyPanelSection (p12/p17/p21), hook-useTechnologies, component-TechCard-p30

## Changes

### Phase 30 — Tech exhaustion state passed to TechCard

```pseudocode
// Add hook call:
const { isExhausted, exhaustTech, readyTech, useTechAction } = useTechnologies(player, gameId)

// Update TechCard render (existing tech list) to pass new props:
<TechCard
  tech={tech}
  isExhausted={isExhausted(tech.name)}
  onExhaust={() => exhaustTech(tech.name)}
  onReady={() => readyTech(tech.name)}
  onUseAction={(name) => useTechAction(name, {})}
/>
```

## Tests

```pseudocode
GIVEN player.exhausted_technologies=['Graviton Laser System']
  EXPECT TechCard for Graviton Laser System receives isExhausted=true
  EXPECT TechCard for other techs receives isExhausted=false
```
