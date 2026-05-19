# fn-game-assign-hits-p43c
**File:** `supabase/functions/game-assign-hits/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// After hits applied, check for SUSTAIN_DAMAGE trigger if any units sustained:
if sustainDamageOccurred:
  { inlineEffects, pendingWindows } = await applyCommanderPassives('SUSTAIN_DAMAGE', {
    gameId, activatingPlayerId: player.id
  }, db)
  // Letnev: pendingWindows includes gain_trade_goods window

// After planet control changes, check PLANET_CONTROL_GAINED:
if planetControlChanged:
  { inlineEffects, pendingWindows } = await applyCommanderPassives('PLANET_CONTROL_GAINED', {
    gameId, activatingPlayerId: player.id, planetName: gainedPlanet
  }, db)
  // Naaz-Rokha: pendingWindows includes explore_planet window

return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Letnev commander — TG on sustain'):
  mock Letnev player with unlocked commander, sustain damage occurs
  EXPECT pending_window for gain_trade_goods

describe('Naaz-Rokha commander — explore on planet gain'):
  mock Naaz-Rokha with unlocked commander, gains a planet
  EXPECT pending_window for explore_planet_free
```
