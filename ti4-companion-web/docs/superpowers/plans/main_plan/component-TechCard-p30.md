# component-TechCard-p30

**File:** `src/components/game/TechCard.jsx`
**Status:** Modify
**Prereqs:** component-TechCard-p28, hook-useTechnologies, lib-techConstants

## Changes

### Phase 30 — Exhausted state, click-to-exhaust, ACTION trigger

```pseudocode
props: add isExhausted, onExhaust, onReady, onUseAction

// Exhausted visual state
if isExhausted:
  apply opacity-50 + rotate-6 classes to card container

// Exhaust/ready button (exhaustable techs only)
if EXHAUSTABLE_TECHS.has(tech.name):
  if isExhausted:
    <button onClick={onReady}>Ready</button>
  else:
    <button onClick={onExhaust}>Exhaust</button>

// Action button (ACTION techs only)
if ACTION_TECHS.has(tech.name) AND NOT isExhausted:
  <button onClick={() => onUseAction(tech.name)}>Use</button>
```

## Tests

```pseudocode
GIVEN isExhausted=true EXPECT opacity-50 and rotate-6 classes present
GIVEN EXHAUSTABLE tech and isExhausted=false EXPECT Exhaust button rendered
GIVEN EXHAUSTABLE tech and isExhausted=true EXPECT Ready button rendered
GIVEN ACTION tech and isExhausted=false EXPECT Use button rendered
GIVEN non-exhaustable, non-action tech EXPECT no Exhaust/Ready/Use buttons
```
