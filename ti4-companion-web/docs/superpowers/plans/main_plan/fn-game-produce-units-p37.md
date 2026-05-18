# fn-game-produce-units-p37
**File:** `supabase/functions/game-produce-units/index.ts`
**Status:** Modify
**Prereqs:** fn-game-use-strategy-secondary-p37

## Changes

Add `warfare_secondary?: boolean` to the request body. When true:
- Skip the `active_player_id` check (the caller is not the active player)
- Skip the `game_system_activations` check (no activation token placed)
- Validate instead that an active Warfare strategy card play exists in this game this round
  (`card_number=6, status='active'`)
- Validate the caller has a `status='used'` response row for that play (they already paid the
  strategy token via `game-use-strategy-secondary`)

All other production logic (resource cost, unit placement, capacity limits) is unchanged.

```pseudocode
body fields: game_id, system_key, units, planet_exhausts?, trade_goods_spend?, warfare_secondary?

if !body.warfare_secondary:
  // existing: active_player check + activation check
  ERR 409 if game.active_player_id !== player.id
  check game_system_activations exists for player this round in system_key
else:
  // Warfare secondary path
  fetch game_strategy_card_plays WHERE game_id + card_number=6 + status='active' + round=game.round
  ERR 409 'No active Warfare play' if not found
  fetch game_strategy_card_responses WHERE play_id + player_id=player.id + status='used'
  ERR 409 'Warfare secondary not used' if not found
  // system_key must be the player's home system — validated by checking their space dock is there
```

## Tests

```pseudocode
warfare_secondary=true: skips active_player + activation checks; validates active Warfare play;
  validates player has used response; proceeds with production
warfare_secondary=true, no active Warfare play: 409
warfare_secondary=true, player has no used response: 409
warfare_secondary=false (default): existing checks still apply
```
