# fn-game-use-strategy-secondary-p37
**File:** `supabase/functions/game-use-strategy-secondary/index.ts`
**Status:** Modify
**Prereqs:** migration-047-strategy-card-effects, shared-abilityDsl-p37

## Changes

Replace generic `interpretEffects(ability.effects)` with a `switch (play.card_number)` block.
Existing validation (STRATEGY_PLAY, NEXT_RESPONDER, ability_source check) is unchanged.
Response row completion logic is unchanged.

```pseudocode
// After existing validation (play fetched, next responder confirmed):
context = { gameId: body.game_id, activatingPlayerId: player.id, selections, gameRound: game.round }
extraResponse = {}

switch play.card_number:
  case 1: // Leadership secondary — optional influence spend for tokens
    if selections.influence_planet_ids?.length > 0:
      await interpretEffects([{op:'spend_strategy_token'}, {op:'spend_influence_for_tokens'}], context, db)
    else:
      await interpretEffects([{op:'spend_strategy_token'}], context, db)
    // Note: LRR §52.3 allows spending any amount including 0; spending 0 still requires token

  case 2: // Diplomacy secondary — spend token + ready up to 2 planets
    ERR 409 if selections.planets_to_ready?.length > 2
    await interpretEffects([{op:'spend_strategy_token'}, {op:'ready_planets'}], context, db)

  case 3: // Politics secondary — spend token + draw 2 action cards
    await interpretEffects([{op:'spend_strategy_token'}, {op:'draw_action_card'}, {op:'draw_action_card'}], context, db)

  case 4: // Construction secondary — spend token + place token in system + place structure on planet in that system
    ERR 409 if !selections.system_coords or !selections.planet_id or !selections.unit_type
    await interpretEffects([{op:'spend_strategy_token'}], context, db)
    // Place command token in chosen system (inserts activation row)
    INSERT game_system_activations { game_id, player_id: player.id, system_key: selections.system_coords,
      round: game.round, token_owner_id: player.id }
    sub = { ...context, selections: { planet_name: selections.planet_id, structure_type: selections.unit_type, choices: true } }
    await interpretEffects([{op:'place_structure'}], sub, db)

  case 5: // Trade secondary — replenish commodities; free if player is in free_secondary_player_ids
    isFree = play.free_secondary_player_ids.includes(player.id)
    if !isFree:
      await interpretEffects([{op:'spend_strategy_token'}], context, db)
    await interpretEffects([{op:'replenish_commodities', target:'self'}], context, db)

  case 6: // Warfare secondary — spend token + return home system key for client production flow
    await interpretEffects([{op:'spend_strategy_token'}], context, db)
    homeSystemKey = await findHomeSystemKey(game_id, player.id, db)
    extraResponse.home_system_key = homeSystemKey

  case 7: // Technology secondary — spend token + 4 resources + research 1 tech
    ERR 409 if !selections.tech_id
    await interpretEffects([{op:'spend_strategy_token'}], context, db)
    await spendResourcesForSecondaryTech(game_id, player.id, selections, db)
      // validates + exhausts planets from sel.tech_resource_planet_ids (≥4 resources)
      // + spends sel.tech_trade_goods trade goods
    ctx = { ...context, selections: { technology_name: selections.tech_id } }
    await interpretEffects([{op:'gain_technology'}], ctx, db)

  case 8: // Imperial secondary — spend token + draw 1 secret objective
    await interpretEffects([{op:'spend_strategy_token'}, {op:'draw_secret_objective'}], context, db)
    // draw_secret_objective already enforces ≤3 total limit (discard if exceeded)

// Mark response used + check play completion (unchanged)
...

OK({ responded: true, play_complete: playComplete, ...extraResponse })
```

Helper `findHomeSystemKey(gameId, playerId, db)`: fetches `game_players.faction` for player,
then scans `games.map_tiles` JSONB to find the key whose tile matches the faction's home tile ID.
Returns the system_key string (e.g. `'0,0'` equivalent for that faction's home).

## Tests

```pseudocode
STD_MOCKS REQ(game_id, play_id, ability_definition_id)
T401 T400 T404_PLAYER TCORS

Per card:
  Leadership: token spent; bonus tokens granted for influence planets; 0 influence → just token spent
  Diplomacy: token spent; up to 2 planets readied; 409 if >2 planets
  Politics: token spent; 2 action cards drawn
  Construction: token spent; activation inserted for chosen system; structure placed on planet
  Trade: free secondary → no token spent; paid secondary → token spent; commodities replenished both ways
  Warfare: token spent; home_system_key in response
  Technology: token spent; 4 resources exhausted; tech researched; 409 insufficient resources
  Imperial: token spent; secret objective drawn
```
