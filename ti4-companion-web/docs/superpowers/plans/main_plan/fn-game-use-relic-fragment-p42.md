# fn-game-use-relic-fragment-p42
**File:** `supabase/functions/game-use-relic-fragment/index.ts`
**Status:** Modify
**Prereqs:** fn-game-use-relic-fragment, shared-relicEffects-p42, shared-abilityDsl-p42

## Functionality
```pseudocode
// After existing applyAbility([{ op:'gain_relic' }], context, db) call:
// context.gainedRelicName is now populated by the updated gain_relic op.
if context.gainedRelicName:
  applyOnGainRelicEffect(context.gainedRelicName, gameId, player.id, db)
```

## Tests
```pseudocode
it('gaining The Obsidian calls draw_secret_objective via applyOnGainRelicEffect')
it('gaining Shard Of The Throne awards 1 VP')
it('gaining other relic does not call applyOnGainRelicEffect effects')
```
