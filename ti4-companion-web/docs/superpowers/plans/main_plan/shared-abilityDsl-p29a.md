# shared-abilityDsl-p29a
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-041-action-card-effects

## Changes

Add 10 new op handlers for Action-timing cards. Each op receives `(db, gameId, playerId, op, selections, context)`.

```pseudocode
case 'exhaust_planet':
  planetName = selections.planet_name
  fetch game_player_planets WHERE game_id + player_id + planet_name=planetName
  ERR 409 'Planet not owned' if not found
  UPDATE game_player_planets SET exhausted=true WHERE id=row.id

case 'destroy_units_on_planet':
  planetName = selections.planet_name
  unitType = op.unit_type
  count = op.count
  fetch game_player_units WHERE game_id + player_id + on_planet=planetName + unit_type=unitType
  ERR 409 'Not enough units' if !op.up_to AND (row is null OR row.count < count)
  toDestroy = MIN(count, row?.count ?? 0)
  if toDestroy > 0:
    UPDATE game_player_units SET count = count - toDestroy
    DELETE if count reaches 0

case 'roll_and_destroy_units':
  targetPlayerId = selections.target_player_id
  planetName = selections.planet_name
  unitType = op.unit_type
  threshold = op.threshold  // destroy if roll <= threshold
  fetch game_player_units WHERE game_id + player_id=targetPlayerId + on_planet=planetName + unit_type=unitType
  ERR 409 'No units on planet' if not found or count=0
  rolls = []
  destroyed = 0
  for each unit (row.count times):
    roll = random 1..10
    rolls.push({ roll, destroyed: roll <= threshold })
    if roll <= threshold: destroyed += 1
  UPDATE game_player_units SET count = count - destroyed
  DELETE if count reaches 0
  return { rolls, destroyed } in response

case 'steal_action_card':
  targetPlayerId = selections.target_player_id
  fetch game_action_card_deck WHERE game_id + held_by_player_id=targetPlayerId + state='hand'
    ORDER BY RANDOM() LIMIT 1
  ERR 409 'Target has no cards' if not found
  UPDATE game_action_card_deck SET held_by_player_id=playerId WHERE id=card.id
  UPDATE game_players SET action_card_count -= 1 WHERE id=targetPlayerId
  UPDATE game_players SET action_card_count += 1 WHERE id=playerId

case 'look_at_hand':
  targetPlayerId = selections.target_player_id
  fetch game_action_card_deck JOIN action_cards
    WHERE deck.game_id + deck.held_by_player_id=targetPlayerId + deck.state='hand'
  // No DB write — return card names to caller in OK response payload
  // (caller receives via response body; other players do not see this)

case 'modify_next_production':
  UPDATE game_players SET production_bonus = production_bonus + op.amount WHERE id=playerId

case 'block_system_movement':
  systemKey = selections.system_key
  UPDATE games SET movement_blocked_systems = array_append(movement_blocked_systems, systemKey)
    WHERE id=gameId

case 'place_unit_no_move':
  systemKey = selections.system_key
  unitType = op.unit_type ?? 'destroyer'
  // place_units logic: upsert game_player_units
  upsert game_player_units { game_id:gameId, player_id:playerId, system_key:systemKey,
    unit_type:unitType, on_planet:null, count:1, no_move_this_round:true }
    ON CONFLICT (game_id, player_id, system_key, unit_type, on_planet):
      SET count = count+1, no_move_this_round=true

case 'remove_tokens_from_board':
  targetPlayerId = selections.target_player_id
  DELETE FROM game_system_activations
    WHERE game_id=gameId AND player_id=targetPlayerId AND round=game.round

case 'swap_strategy_cards':
  targetPlayerId = selections.target_player_id
  fetch game_strategy_card_assignments WHERE game_id + player_id=playerId → myRow
  fetch game_strategy_card_assignments WHERE game_id + player_id=targetPlayerId → theirRow
  ERR 409 'Strategy card not assigned' if either missing
  UPDATE game_strategy_card_assignments SET strategy_card_id=theirRow.strategy_card_id WHERE id=myRow.id
  UPDATE game_strategy_card_assignments SET strategy_card_id=myRow.strategy_card_id WHERE id=theirRow.id
```

Also add round-end resets in the existing `game-advance-phase` function (Phase 29a):
```pseudocode
// When advancing to a new round (game.round increments):
UPDATE games SET movement_blocked_systems='{}' WHERE id=gameId
UPDATE game_player_units SET no_move_this_round=false WHERE game_id=gameId
```

## Tests

Extend `tests/lib/abilityDsl.test.js` — one describe block per new op:
```pseudocode
exhaust_planet: happy path; 409 planet not owned
destroy_units_on_planet: happy path; 409 not enough units; up_to=true with fewer than count
roll_and_destroy_units: all destroyed; none destroyed; mixed
steal_action_card: happy path; 409 target has no cards; both action_card_count updated
look_at_hand: returns card list; no DB write
modify_next_production: increments production_bonus
block_system_movement: appends to array
place_unit_no_move: new unit row; existing unit incremented; no_move_this_round=true
remove_tokens_from_board: deletes activations for target player this round only
swap_strategy_cards: swaps card ids; 409 if either missing
```
