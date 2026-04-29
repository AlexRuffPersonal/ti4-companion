# fn-game-use-technology-action

**File:** `supabase/functions/game-use-technology-action/index.ts`
**Status:** New
**Prereqs:** migration-043-tech-effects, shared-techEffects

## Functionality

Dispatches ACTION-typed tech effects. Called when a player explicitly activates a tech with "ACTION:" text.

```pseudocode
CORS; AUTH; BODY(game_id, technology_name, selections)
PLAYER(technologies, exhausted_technologies, trade_goods, command_tokens)

ERR 409 'Technology not owned' if technology_name NOT IN player.technologies

// Dispatch per tech; exhaust after effect where applicable
switch technology_name:

  case 'X-89 Bacterial Weapon':
    ERR 409 'Technology already exhausted' if exhausted
    planetName = selections.planet_name
    // verify player has ship with Bombardment in that planet's system
    DELETE game_player_units WHERE game_id + on_planet=planetName + unit_type='infantry'
    exhaust tech

  case 'Production Biomes':
    ERR 409 'Technology already exhausted' if exhausted
    ERR 409 'Insufficient strategy tokens' if command_tokens.strategy < 1
    chosenPlayerId = selections.chosen_player_id
    UPDATE game_players SET trade_goods += 4 WHERE id=player.id
    UPDATE game_players SET trade_goods += 2 WHERE id=chosenPlayerId
    UPDATE game_players SET command_tokens.strategy -= 1 WHERE id=player.id
    exhaust tech

  case 'Sling Relay':
    ERR 409 'Technology already exhausted' if exhausted
    systemKey = selections.system_key; unitType = selections.unit_type
    // verify player has space dock in that system
    upsert game_player_units { game_id, player_id, system_key, unit_type, on_planet:null, count:1 }
      ON CONFLICT increment count
    exhaust tech

  case 'Vortex':
    ERR 409 'Technology already exhausted' if exhausted
    targetPlayerId = selections.target_player_id; unitType = selections.unit_type
    // verify target system adjacent to player space dock
    upsert game_player_units { game_id, player_id:player.id, system_key, unit_type, on_planet:null, count:1 }
    exhaust tech

  case 'Mageon Implants':
    ERR 409 'Technology already exhausted' if exhausted
    cardId = selections.card_id
    UPDATE game_action_card_deck SET held_by_player_id=player.id WHERE id=cardId
    UPDATE game_players SET action_card_count += 1 WHERE id=player.id
    UPDATE game_players SET action_card_count -= 1 WHERE id=targetPlayerId
    exhaust tech

  case 'Lazax Gate Folding':
    ERR 409 'Technology already exhausted' if exhausted
    // verify player controls Mecatol Rex
    upsert game_player_units { game_id, player_id, system_key:'0,0', unit_type:'infantry', on_planet:'Mecatol Rex', count:1 }
      ON CONFLICT increment count
    exhaust tech

  case 'Transit Diodes':
    ERR 409 'Technology already exhausted' if exhausted
    unitMoves = selections.unit_moves  // [{from_system, planet_name, to_planet}...]
    ERR 409 if more than 4 units moved
    for each move: validate from/to are controlled planets; update game_player_units
    exhaust tech

  case 'Chaos Mapping':
    // produce 1 unit at start of turn (no exhaust — not exhaustable)
    systemKey = selections.system_key; unitType = selections.unit_type
    // verify player has unit with Production in that system
    upsert game_player_units { game_id, player_id, system_key, unit_type, count:1 }

  default:
    ERR 400 'Unknown technology action'

OK({})
```

## Tests

```pseudocode
STD_MOCKS
TCORS; T401; T400(game_id); T400(technology_name); T404_PLAYER
T409('Technology not owned')
T409('Technology already exhausted') — for exhaustable action techs
Production Biomes: trade_goods incremented for both players; strategy token spent; tech exhausted
Sling Relay: unit inserted in system; tech exhausted
```
