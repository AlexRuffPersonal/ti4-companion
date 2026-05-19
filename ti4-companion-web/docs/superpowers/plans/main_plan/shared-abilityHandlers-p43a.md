# shared-abilityHandlers-p43a
**File:** `supabase/functions/_shared/abilityHandlers.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects, shared-abilityDsl-p43a

## Changes
Register all named handlers for complex agent abilities.

```pseudocode
'ssruu_copies_agents': async (context, db) => {
  // Yssaril agent: copies all other agents' text — display-only, no server effect.
  // Just exhaust the card normally; client shows all other agents' card text in the modal.
  // No DB writes beyond the exhaust handled by game-resolve-ability.
}

'nekro_malleon': async (context, db) => {
  // Nekro agent: chosen player discards 1 action card OR spends 1 command token → gains 2 TG
  targetPlayerId = context.selections.chosen_player_id
  choice = context.selections.choice  // 'action_card' | 'command_token'
  if choice === 'action_card':
    cardId = context.selections.card_id
    fetch game_action_card_deck WHERE id=cardId AND held_by_player_id=targetPlayerId AND state='hand'
    ERR 409 'Card not in target hand' if not found
    UPDATE game_action_card_deck SET state='discarded', held_by_player_id=null WHERE id=cardId
    UPDATE game_players SET action_card_count = action_card_count - 1 WHERE id=targetPlayerId
  if choice === 'command_token':
    fetch game_players WHERE id=targetPlayerId
    ERR 409 'No command tokens on sheet' if all pools = 0
    bucket = context.selections.token_bucket  // 'tactic_total'|'fleet'|'strategy'
    UPDATE game_players SET command_tokens[bucket] -= 1 WHERE id=targetPlayerId
  UPDATE game_players SET trade_goods += 2 WHERE id=targetPlayerId
}

'stillness_of_stars': async (context, db) => {
  // Vuil'raith agent: after another player replenishes commodities → convert to TG + capture 1 unit
  targetPlayerId = context.selections.chosen_player_id
  fetch game_players WHERE id=targetPlayerId → targetPlayer
  commodityValue = targetPlayer.commodities
  ERR 409 'Target has no commodities' if commodityValue = 0
  capturedUnitType = context.selections.unit_type
  fetch units WHERE name=capturedUnitType → unitDef
  ERR 409 'Unit cost exceeds commodity value' if unitDef.cost > commodityValue
  UPDATE game_players SET trade_goods += commodityValue, commodities = 0 WHERE id=targetPlayerId
  // captured unit returned to Vuil'raith reinforcements (no DB row needed — units come from reinforcements)
}
// ... remaining complex agent handlers following the same pattern
```

## Tests
Each handler covered in `tests/functions/game-resolve-ability.test.js` via the agent resolution path.
