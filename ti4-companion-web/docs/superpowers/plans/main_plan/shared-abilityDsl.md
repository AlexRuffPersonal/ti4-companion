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

### Phase 17 — Exploration & Relic ops

```pseudocode
case 'gain_commodities':
  amount = op.amount === 'max' ? faction.commodities_max : op.amount
  fetch player faction commodities_max
  update game_players SET commodities = MIN(commodities + amount, commodities_max)

case 'gain_relic_fragment':
  update game_exploration_decks SET state='held', resolved_by_player_id=playerId
         WHERE id=context.card_id
  // keep_card=true (Enigmatic Device): state stays 'held' permanently

case 'attach_to_planet':
  attachmentRow = select attachments where name=op.attachment
  ERR 409 'Attachment not found' if !attachmentRow
  update game_player_planets SET attachments = array_append(attachments, attachmentRow.id)
         WHERE game_id + player_id + planet_name=context.planet_name

case 'place_map_token':
  if op.token_type = 'gamma_wormhole':
    update game_system_state SET wormholes = array_append(wormholes, 'gamma')
           WHERE game_id + system_key=context.system_key
  if op.token_type = 'ion_storm':
    update game_system_state SET ion_storm = true
           WHERE game_id + system_key=context.system_key (upsert)

case 'place_mirage':
  // Insert Mirage as a new planet in the explored system
  tileId = TILE_ID(context.system_key, game)
  insert game_player_planets { game_id, player_id, planet_name:'Mirage', tile_id: tileId,
                                exhausted:false, explored:true }

case 'gain_relic':
  relicRow = select game_relic_deck where game_id + state='deck'
             ORDER BY deck_position ASC LIMIT 1
  ERR 409 'Relic deck empty' if !relicRow
  update game_relic_deck SET state='held', held_by_player_id=playerId WHERE id=relicRow.id

case 'explore_planet':
  // Delegates to the same draw+resolve logic as game-explore-planet/game-resolve-exploration-card
  // Used by Crown of Emphidia exhaust ability
  target planet = context.selections.planet_name
  [internal call: drawExplorationCard(gameId, playerId, target) → resolveExplorationCard(...)]

case 'choice':
  selectedOps = op.options[context.choice ?? 0]
  applyAbility(selectedOps, context, db)

case 'conditional_mech_or_infantry':
  hasMech = query game_player_units where game_id + player_id + on_planet=context.planet_name
            AND unit_type='mech' AND count > 0
  if hasMech:
    applyAbility(op.effect, context, db)
  elif context.remove_infantry:
    // Remove 1 infantry from planet
    infantryRow = select game_player_units where game_id + player_id + on_planet=context.planet_name
                  AND unit_type='infantry' AND count > 0
    ERR 409 'No infantry to remove' if !infantryRow
    update game_player_units SET count = count - 1 WHERE id=infantryRow.id
    delete if count becomes 0
    applyAbility(op.effect, context, db)
  // else: neither condition met, skip effect
```

## Tests

No standalone test file — covered through `game-resolve-ability` and exploration function tests for each new op.
