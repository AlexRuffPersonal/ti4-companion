# fn-game-move-ships-p43c
**File:** `supabase/functions/game-move-ships/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// After ships moved, apply SHIPS_MOVED passives:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('SHIPS_MOVED', {
  gameId, activatingPlayerId: player.id, systemKey: destSystemKey,
  movedShips, wormholesTransited
}, db)
// Creuss Sai Seravus: if any capacity ship moved through wormhole AND unused capacity in dest:
//   pendingWindows includes place_units fighter window
// Empyrean Xuange: if dest system contains another player's command token:
//   empyrean_return_token handler emits commander_passive window for that player

return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Creuss commander — fighter placement after wormhole transit'):
  mock Creuss with unlocked commander, carrier moves through wormhole with unused capacity
  EXPECT pending_window for place fighter

describe('Empyrean commander — return token window'):
  mock Empyrean with unlocked commander, another player moves into system with Empyrean token
  EXPECT pending_window for empyrean_return_token
```
