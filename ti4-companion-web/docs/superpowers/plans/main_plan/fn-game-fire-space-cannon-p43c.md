# fn-game-fire-space-cannon-p43c
**File:** `supabase/functions/game-fire-space-cannon/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// After rolling space cannon dice, apply UNIT_ABILITY_ROLL passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('UNIT_ABILITY_ROLL', {
  gameId, activatingPlayerId: player.id, currentDiceResults: diceResults
}, db)
// Argent Flight: add_die window; Jol-Nar: reroll window
return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Argent Flight commander — extra die on space cannon'):
  mock Argent player with unlocked commander
  EXPECT pending_window.type='commander_passive' for add_die
```
