# fn-game-fire-bombardment-p43c
**File:** `supabase/functions/game-fire-bombardment/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// Before planetary shield check:
{ inlineEffects } = await applyCommanderPassives('BOMBARDMENT', {
  gameId, activatingPlayerId: player.id
}, db)

// L1Z1X commander: context.skipPlanetaryShield=true → skip shield check entirely
if NOT context.skipPlanetaryShield:
  // existing planetary shield check
  ERR 409 'Planetary Shield prevents bombardment' if target planet has PDS owner with Planetary Shield

// After rolling bombardment dice, apply UNIT_ABILITY_ROLL passives:
{ inlineEffects: rollEffects, pendingWindows } = await applyCommanderPassives('UNIT_ABILITY_ROLL', {
  gameId, activatingPlayerId: player.id, currentDiceResults: diceResults
}, db)
// Argent Flight: add_die window; Jol-Nar: reroll window
```

## Tests
```pseudocode
describe('L1Z1X commander — skip planetary shield'):
  mock L1Z1X with unlocked commander, target has Planetary Shield
  EXPECT bombardment proceeds without 409

describe('Argent Flight commander — extra die on bombardment'):
  mock Argent Flight with unlocked commander
  EXPECT pending_window for add_die
```
