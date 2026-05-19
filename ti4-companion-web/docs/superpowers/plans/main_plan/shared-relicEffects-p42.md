# shared-relicEffects-p42
**File:** `supabase/functions/_shared/relicEffects.ts`
**Status:** Modify
**Prereqs:** shared-relicEffects, shared-abilityDsl

## Functionality
```pseudocode
// Remove 'Enigmatic Device' entry entirely.
// Fix op name mismatches from Phase 17:
//   'choice'             → 'choose_one'     (Prophet's Tears)
//   'exhaust_all_planets'→ 'exhaust_planets' (Maw Of Worlds)
// Empty op arrays for Scepter (exhausts only) and Obsidian (gain-hook only).
//
// Add exported helper:
applyOnGainRelicEffect(relicName, gameId, playerId, db):
  ctx = { gameId, activatingPlayerId: playerId }
  if relicName === 'The Obsidian':
    applyAbility([{ op:'draw_secret_objective' }], ctx, db)
  if relicName === 'Shard Of The Throne':
    UPDATE game_players SET vp = vp + 1 WHERE id = playerId
```

## Tests
Covered through game-use-relic, game-use-relic-fragment integration tests.
