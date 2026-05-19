# shared-abilityDsl-p43a
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-052-leader-abilities

## Changes
Add the following new op handlers to the DSL executor:

```pseudocode
case 'reclaim_command_tokens':
  fetch game_system_activations WHERE game_id + player_id
  delete all rows (removes tactic tokens from the board)
  // Also remove fleet tokens placed this round if tracked; otherwise just activations

case 'produce_in_systems_with_ground_forces':
  // Arborec hero: produce any units in any system containing player's ground forces
  systems = SELECT DISTINCT system_key FROM game_player_units
             WHERE game_id + player_id + unit_type IN ('infantry','mech') + on_planet IS NOT NULL
  for each (system, unitType, count) in context.selections.produce_list:
    ERR 409 'System has no ground forces' if system not in systems
    upsert game_player_units { game_id, player_id, system_key, unit_type, on_planet:null, count }
      ON CONFLICT increment count

case 'produce_units_free':
  // Hacan hero: run produce with all costs = 0 (server enforces 0 cost for this resolution)
  context.free_production = true
  // The production logic in produce_units respects context.free_production

case 'explore_planet_free':
  // Naaz-Rokha commander: explore a planet the player controls without spending resources
  planetName = context.selections.planet_name
  fetch game_player_planets WHERE game_id + player_id + planet_name=planetName
  ERR 409 'Planet not controlled' if not found
  [internal call: drawExplorationCard(gameId, playerId, planetName)]

case 'replace_ship':
  // Arborec agent: replace a non-fighter ship with one costing up to 2 more
  targetPlayerId = context.selections.chosen_player_id
  sourceSystemKey = context.selections.system_key
  oldUnitType = context.selections.old_unit_type
  newUnitType = context.selections.new_unit_type
  fetch units WHERE name = oldUnitType → oldDef; fetch units WHERE name = newUnitType → newDef
  ERR 409 'New unit must cost at most 2 more' if newDef.cost > oldDef.cost + 2
  ERR 409 'Source unit not found' if no game_player_units row for (targetPlayerId, sourceSystemKey, oldUnitType)
  decrement old unit count (delete if 0)
  upsert new unit at same system

case 'increase_move':
  // Saar agent: set 1 ship's move value to max move value on board this turn
  shipId = context.selections.ship_id
  maxMove = SELECT MAX of parsed move stat across all game_player_units joined to units table
  context.move_override = { ship_id: shipId, move: maxMove }
  // move_override read by game-move-ships when processing this tactical action

case 'produce_at_any_space_dock':
  // Saar commander passive effect: fighters/infantry from this production placed at chosen space dock
  dockPlanet = context.selections.dock_planet
  unitType = context.unit_type  // set by caller
  upsert game_player_units { ..., on_planet: dockPlanet }

case 'give_promissory_to_opponent':
  // Mentak commander: after winning space combat, opponent gives 1 promissory note
  opponentId = context.selections.chosen_player_id
  noteId = context.selections.note_id
  fetch game_promissory_notes WHERE id=noteId AND held_by_player_id=opponentId
  ERR 409 'Note not found in opponent hand' if not found
  update game_promissory_notes SET held_by_player_id=activatingPlayerId
```

## Tests
Extend `tests/lib/abilityDsl.test.js`. One describe block per new op.

```pseudocode
describe('reclaim_command_tokens'):
  mock activations rows for player
  EXPECT all deleted after resolution

describe('replace_ship'):
  T409('new unit costs more than 2 above old')
  T409('source unit not found')
  EXPECT old unit decremented, new unit upserted

describe('give_promissory_to_opponent'):
  T409('note not in opponent hand')
  EXPECT note transferred to activating player
```
