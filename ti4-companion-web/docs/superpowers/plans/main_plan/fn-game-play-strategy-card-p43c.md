# fn-game-play-strategy-card-p43c
**File:** `supabase/functions/game-play-strategy-card/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// After strategy token spent (primary resolved), apply STRATEGY_TOKEN_SPENT passive:
{ inlineEffects, pendingWindows } = await applyCommanderPassives('STRATEGY_TOKEN_SPENT', {
  gameId, activatingPlayerId: player.id
}, db)
// Muaat Magmus: pendingWindows includes gain_trade_goods window

return okResponse({ ...result, pending_window: pendingWindows[0] ?? undefined })
```

## Tests
```pseudocode
describe('Muaat commander — gain TG after strategy token spent'):
  mock Muaat player with unlocked commander
  play strategy card primary
  EXPECT pending_window for gain_trade_goods
```
