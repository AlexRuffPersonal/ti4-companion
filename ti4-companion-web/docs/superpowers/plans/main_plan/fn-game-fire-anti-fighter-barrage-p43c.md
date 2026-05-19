# fn-game-fire-anti-fighter-barrage-p43c
**File:** `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// After rolling AFB dice, apply UNIT_ABILITY_ROLL passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('UNIT_ABILITY_ROLL', {
  gameId, activatingPlayerId: player.id, currentDiceResults: diceResults
}, db)
// Argent Flight: add_die window; Jol-Nar: reroll window
return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Argent Flight commander — extra die on AFB'):
  mock Argent player with unlocked commander
  EXPECT pending_window for add_die
```
