# fn-game-resolve-exploration-card-p42
**File:** `supabase/functions/game-resolve-exploration-card/index.ts`
**Status:** Modify
**Prereqs:** fn-game-resolve-exploration-card, shared-relicEffects-p42, shared-abilityDsl-p42

## Functionality
```pseudocode
// After resolving a card that grants a relic (op='gain_relic'), the gain_relic op
// sets context.gainedRelicName. After applyAbility completes:
if context.gainedRelicName:
  applyOnGainRelicEffect(context.gainedRelicName, gameId, player.id, db)
```

## Tests
```pseudocode
it('resolving a gain_relic card for The Obsidian triggers draw_secret_objective')
it('resolving a gain_relic card for Shard Of The Throne awards VP')
```
