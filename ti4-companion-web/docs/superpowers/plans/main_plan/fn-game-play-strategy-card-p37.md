# fn-game-play-strategy-card-p37
**File:** `supabase/functions/game-play-strategy-card/index.ts`
**Status:** Modify
**Prereqs:** migration-047-strategy-card-effects, shared-abilityDsl-p37

## Changes

Replace the generic `interpretEffects(ability.effects)` call with a `switch (player.strategy_card)`
block that routes card-specific selections to DSL ops. The play row creation and response row
creation logic is unchanged.

```pseudocode
CORS AUTH BODY(game_id, ability_definition_id, selections?) PLAYER(id,strategy_card,seat_index) GAME(id,phase,active_player_id,round)
ACTIVE_PLAYER
ERR 409 if game.phase !== 'action'
validate ability_source exists for ability_definition_id + source_type='strategy_card'
ERR 409 if existing active play for this round

context = { gameId, activatingPlayerId: player.id, selections, gameRound: game.round }
extraResponse = {}

switch player.strategy_card:
  case 1: // Leadership — gain 3 tokens + optional influence spend
    await interpretEffects([{op:'gain_command_tokens', bucket:'tactic_total', amount:3}], context, db)
    if selections.influence_planet_ids?.length > 0:
      await interpretEffects([{op:'spend_influence_for_tokens'}], context, db)

  case 2: // Diplomacy — lock system + ready planets
    ERR 409 if !selections.target_system_coords
    ERR 409 if selections.planets_to_ready?.length > 2
    await interpretEffects([{op:'diplomacy_lock_system'}, {op:'ready_planets'}], context, db)

  case 3: // Politics — peek top 2 agendas, draw 2 action cards, change speaker
    ERR 409 if !selections.new_speaker_player_id
    ERR 409 if !selections.ordered_card_ids or length !== 2
    // Fetch card details before applying reorder (for response body only)
    peekCards = await fetchTopAgendaCards(game_id, 2, db)
    await interpretEffects([
      {op:'set_speaker'},          // uses sel.new_speaker_player_id → sel.chosen_player_id
      {op:'draw_action_card'},
      {op:'draw_action_card'},
      {op:'peek_agenda', count:2}  // uses sel.ordered_card_ids
    ], context, db)
    extraResponse.peek_cards = peekCards

  case 4: // Construction — place 1-2 structures
    ERR 409 if !selections.structures or structures.length === 0
    for each s in selections.structures[0..1]:  // max 2
      sub = { ...context, selections: { planet_name: s.planet_id, structure_type: s.unit_type, choices: true } }
      await interpretEffects([{op:'place_structure'}], sub, db)

  case 5: // Trade — gain 3 TGs, replenish commodities, grant free secondary
    await interpretEffects([
      {op:'gain_trade_goods', amount:3},
      {op:'replenish_commodities', target:'self'}
    ], context, db)
    // grant_free_secondary written after play row created (see below)

  case 6: // Warfare — remove board token + redistribute
    ERR 409 if !selections.remove_from_system_coords
    ERR 409 if redistribution values missing or sum > 16
    await interpretEffects([{op:'warfare_remove_board_token'}, {op:'warfare_redistribute_tokens'}], context, db)

  case 7: // Technology — research 1 free, optional 2nd for 6 resources
    ERR 409 if !selections.tech_1_id
    ctx1 = { ...context, selections: { technology_name: selections.tech_1_id } }
    await interpretEffects([{op:'gain_technology'}], ctx1, db)
    if selections.tech_2_id:
      await spendResourcesForTech(game_id, player.id, selections, db)  // inline helper: validate+exhaust 6 resources
      ctx2 = { ...context, selections: { technology_name: selections.tech_2_id } }
      await interpretEffects([{op:'gain_technology'}], ctx2, db)

  case 8: // Imperial — score public objective + Mecatol VP or draw secret objective
    if selections.public_objective_id:
      await interpretEffects([{op:'score_public_objective'}], context, db)
    hasMecatol = await playerControlsMecatol(game_id, player.id, db)
    if hasMecatol:
      await interpretEffects([{op:'score_imperial_point'}], context, db)
    else:
      await interpretEffects([{op:'draw_secret_objective'}], context, db)

// Create play row (unchanged)
play = INSERT game_strategy_card_plays { ..., status:'active' }

// Post-creation: update free_secondary for Trade
if player.strategy_card === 5 and selections.free_secondary_player_ids?.length > 0:
  UPDATE game_strategy_card_plays SET free_secondary_player_ids = selections.free_secondary_player_ids WHERE id = play.id

// Create response rows (unchanged)
...

OK({ play_id: play.id, ...extraResponse })
```

Helper `fetchTopAgendaCards(gameId, n, db)`: queries `game_agenda_deck` for top `n` deck cards,
joins `agenda_cards` for name + text, returns `[{id, name, text}]`.

Helper `spendResourcesForTech(gameId, playerId, selections, db)`: exhausts planets from
`selections.tech_2_resource_planet_ids` + spends `selections.tech_2_trade_goods` trade goods;
validates total resources ≥ 6.

Helper `playerControlsMecatol(gameId, playerId, db)`: queries `game_player_planets` for
`planet_name='Mecatol Rex'`.

## Tests

```pseudocode
STD_MOCKS REQ(game_id, ability_definition_id)
T401 T400(game_id) T400(ability_definition_id) T404_PLAYER TCORS T409_ACTIVE

Per card:
  Leadership: 3 tokens granted; influence planets exhausted; floor(inf/3) bonus tokens
  Diplomacy: lock system called for others; 2 planets readied; 409 if target_system_coords missing
  Politics: peek_cards in response; speaker changed; 2 action cards drawn; agenda reordered
  Construction: place_structure called for each structure in array; 409 if no structures
  Trade: 3 TGs gained; commodities replenished; free_secondary_player_ids written to play row
  Warfare: board token removed; tokens redistributed; 409 if sum > 16
  Technology: tech_1 researched free; tech_2 researched after 6 resources spent; 409 insufficient resources
  Imperial: public objective scored if provided; VP if Mecatol; secret objective drawn if no Mecatol
```
