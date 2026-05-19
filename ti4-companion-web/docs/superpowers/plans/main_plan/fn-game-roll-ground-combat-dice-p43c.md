# fn-game-roll-ground-combat-dice-p43c
**File:** `supabase/functions/game-roll-ground-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c, fn-game-roll-combat-dice-p43c

## Changes
Same pattern as `fn-game-roll-combat-dice-p43c` — apply COMBAT_ROLL passives after rolling.
Winnu +2 and Jol-Nar reroll window both apply to ground combat dice as well.

```pseudocode
{ inlineEffects, pendingWindows } = await applyCommanderPassives('COMBAT_ROLL', {
  gameId, activatingPlayerId: player.id, systemKey, currentDiceResults: diceResults
}, db)
// same bonus/reroll application as space combat version
```

## Tests
```pseudocode
describe('Winnu +2 applies in ground combat'):
  mock Winnu with unlocked commander, ground combat in legendary planet system
  EXPECT +2 applied to ground combat results
```
