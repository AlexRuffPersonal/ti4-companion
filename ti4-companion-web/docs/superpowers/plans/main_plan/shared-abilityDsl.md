# shared-abilityDsl

**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-029-strategy-production

## Changes

Add the following op handlers to the DSL executor. Each op receives `(db, gameId, playerId, op, selections)`.

```pseudocode
case 'spend_strategy_token':
  fetch player command_tokens
  ERR 409 if command_tokens.strategy < 1
  update game_players SET command_tokens.strategy -= 1

case 'replenish_commodities':
  targetId = op.target === 'self' ? playerId : selections.chosen_player_id
  fetch factions.commodities for target player's faction
  update game_players SET commodities = factions.commodities WHERE id = targetId

case 'gain_trade_goods':
  update game_players SET trade_goods += op.amount WHERE id = playerId

case 'place_structure':
  planetName = selections.planet_name
  structureType = op.choices ? selections.structure_type : op.structure_type
  fetch game_player_planets row for (gameId, playerId, planetName)
  ERR 409 if planet not owned by player
  IF structureType === 'space_dock':
    ERR 409 if planet.space_dock_unit_id is not null ('Planet already has a space dock')
    unitId = fetch units WHERE name = 'Space Dock' (or faction variant from selections)
    update game_player_planets SET space_dock_unit_id = unitId
  IF structureType === 'pds':
    ERR 409 if planet.pds_count >= 2 ('Planet already has 2 PDS')
    update game_player_planets SET pds_count += 1

case 'ready_planets':
  amount = op.amount
  planetNames = selections.planet_names (array, length <= amount)
  ERR 409 if any planet not owned by player or not exhausted
  update game_player_planets SET exhausted = false WHERE planet_name IN planetNames

case 'set_speaker':
  newSpeakerId = selections.chosen_player_id
  ERR 409 if chosen player not in game
  update games SET speaker_player_id = newSpeakerId

case 'peek_agenda':
  count = op.count ?? 2
  fetch top `count` agenda deck cards by deck_position WHERE state = 'deck'
  return cards to caller as part of OK response for client-side reordering
  apply reordered deck_positions from selections.ordered_card_ids

case 'draw_action_card':
  fetch top action card by deck_position WHERE state = 'deck'
  ERR 409 if deck empty
  update game_action_card_deck SET state = 'hand', held_by_player_id = playerId, deck_position = null

case 'score_imperial_point':
  fetch game_player_planets WHERE player_id = playerId AND planet_name = 'Mecatol Rex'
  ERR 409 if not found ('You do not control Mecatol Rex')
  update game_players SET vp += 1 WHERE id = playerId

case 'draw_secret_objective':
  fetch top secret objective card by deck_position WHERE state = 'deck'
  ERR 409 if deck empty
  update game_player_secret_objectives SET state = 'held', held_by_player_id = playerId
```

## Tests

No standalone test file — covered through `game-resolve-ability` tests for each new op.
