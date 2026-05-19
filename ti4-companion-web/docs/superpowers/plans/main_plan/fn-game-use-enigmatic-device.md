# fn-game-use-enigmatic-device
**File:** `supabase/functions/game-use-enigmatic-device/index.ts`
**Status:** New
**Prereqs:** migration-051-exploration-fixes, shared-abilityDsl

## Functionality
```pseudocode
CORS; AUTH
BODY(game_id, player_id, card_id, resource_planet_names, technology_name)

PLAYER
fetch game_exploration_decks WHERE id=card_id + game_id
ERR 404 'Card not found' if missing
ERR 409 'Card not in held state' if state != 'held'
ERR 409 'Not your card' if resolved_by_player_id != player_id
ERR 409 'Card is not an Enigmatic Device' if name != 'Enigmatic Device'

// Validate resource planets
fetch game_player_planets WHERE game_id + player_id + planet_name IN resource_planet_names
ERR 409 'One or more planets not found or not controlled' if count != resource_planet_names.length
ERR 409 'One or more planets are already exhausted' if any exhausted

// Sum resources via tile reference
tileIds = unique planet.tile_id values (filter nulls)
fetch tiles WHERE id IN tileIds → tileMap
totalResources = sum(tileMap[planet.tile_id].planets[planet_name].resources) for each planet
ERR 409 'Insufficient resources (need 6)' if totalResources < 6

// Research technology (handles prereq check + tech array update)
applyAbility([{op:'gain_technology'}], context{selections:{technology_name}}, db)

// Exhaust chosen planets
update game_player_planets SET exhausted=true
WHERE game_id + player_id + planet_name IN resource_planet_names

// Purge card
update game_exploration_decks SET state='purged', resolved_by_player_id=null
WHERE id=card_id

OK({ technology: technology_name })
```

## Tests
```pseudocode
STD_MOCKS
T401; TCORS
T400('game_id'); T400('player_id'); T400('card_id')
T400('resource_planet_names'); T400('technology_name')
T404_PLAYER
T404 'card not found'
T409('Card not in held state') — state='discarded'
T409('Not your card') — resolved_by_player_id differs
T409('Card is not an Enigmatic Device') — wrong card name

it('409 One or more planets not found') — resource_planet_names has unknown planet
it('409 One or more planets are already exhausted')
it('409 Insufficient resources') — planets total < 6

it('researches technology and purges card on success')
  planets with resources=6; valid technology
  → applyAbility called with gain_technology op
  → planets exhausted
  → card state='purged'
  → OK({ technology })

it('propagates 409 from applyAbility when tech prereqs not met')
  applyAbility throws with status 409
  → returns 409 with that message
```
