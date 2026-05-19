# fn-game-roll-combat-dice-p43c
**File:** `supabase/functions/game-roll-combat-dice/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// Before finalising dice results, apply COMBAT_ROLL passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('COMBAT_ROLL', {
  gameId, activatingPlayerId: player.id, systemKey,
  currentDiceResults: diceResults
}, db)

// Winnu commander: context.combatRollBonus=2 → add 2 to each die result (already rolled)
if context.combatRollBonus:
  diceResults = diceResults.map(d => ({ ...d, roll: d.roll + context.combatRollBonus,
    hit: (d.roll + context.combatRollBonus) >= d.hit_on }))
  recount hits

// Jol-Nar commander: pendingWindows includes commander_reroll window with current dice
return okResponse({ ...result, dice: diceResults, hits, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Winnu commander — +2 combat bonus in Mecatol'):
  mock Winnu player with unlocked commander, system = Mecatol Rex
  EXPECT each die result increased by 2

describe('Winnu commander — no bonus outside special systems'):
  mock Winnu player, system = random non-special system
  EXPECT dice unchanged

describe('Jol-Nar commander — reroll window emitted'):
  mock Jol-Nar player with unlocked commander
  EXPECT pending_window.type='commander_reroll' in response
```
