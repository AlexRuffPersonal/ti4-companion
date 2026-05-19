# fn-game-research-technology-p43c
**File:** `supabase/functions/game-research-technology/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// Before prerequisite check, apply TECH_RESEARCHED inline passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('TECH_RESEARCHED', {
  gameId, activatingPlayerId: player.id
}, db)

// If context.ignoreOnePrerequisite=true (Yin Omar): treat one prerequisite colour as satisfied
if context.ignoreOnePrerequisite:
  // subtract 1 from the most-deficient prerequisite colour before checking
  // (same logic as ignore_prerequisite DSL op but limited to 1 colour)

// After researching, emit pending windows (Nekro draws action card):
return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Nekro commander — draw action card after research'):
  mock Nekro player with unlocked commander
  EXPECT pending_window.type='commander_passive' for draw action card

describe('Yin Omar — prerequisite bypass'):
  mock Yin player with unlocked commander, missing 1 prerequisite
  EXPECT research succeeds with one prereq forgiven
```
