# fn-game-commit-ground-forces

**File:** `supabase/functions/game-commit-ground-forces/index.ts`
**Status:** New (replaces `game-land-troops` from Phase 11)
**Prereqs:** migration-028-ground-combat, migration-031-invasion

## Functionality

```pseudocode
CORS AUTH BODY(game_id, system_key, planet_name, troop_count≥1) PLAYER GAME(round, map_tiles, custodians_claimed)

ACTIVATION(system_key)
TILE_ID(system_key, game) → tileId
TILE(tileId)
PLANET_EXISTS(planet_name, tile)

// Bombardment must be resolved before committing troops (if attacker has bombardment ships)
activation = query game_system_activations
  WHERE game_id, system_key, player_id=player.id, round=game.round
atkSpaceUnits = query game_player_units
  WHERE game_id, system_key, player_id=player.id, on_planet IS NULL
atkTypes = distinct unit_type from atkSpaceUnits
bombDefs = query units WHERE name IN atkTypes AND bombardment IS NOT NULL
if bombDefs.length > 0 AND !activation.bombardment_done:
  ERR('Must resolve bombardment phase before committing ground forces', 409)

defenders = query game_player_units
  WHERE game_id, system_key, on_planet=planet_name, player_id != player.id

// Place attacker's infantry on planet
upsert game_player_units {
  game_id, system_key, player_id: player.id,
  unit_type: 'infantry', on_planet: planet_name,
  count: troop_count
} onConflict(game_id, system_key, player_id, unit_type, on_planet) → increment count

IF defenders.length > 0:
  defTypes = distinct unit_type from defenders
  scdDefs = query units WHERE name IN defTypes AND space_cannon IS NOT NULL
  initialPhase = scdDefs.length > 0 ? 'scd_fire' : 'attacker_roll'

  insert game_combats {
    game_id, system_key,
    combat_type: 'ground',
    planet_name,
    attacker_player_id: player.id,
    defender_player_id: defenders[0].player_id,
    phase: initialPhase,
    round: game.round
  }
  OK({ combat_id: <inserted id> })
ELSE:
  CLAIM_PLANET(game_id, player.id, planet_name, tileId)
  CUSTODIANS(game_id, player.id, system_key, game)
  OK({ claimed: true, custodians_claimed?: true })
```

## Tests

New file: `tests/functions/game-commit-ground-forces.test.js`

```pseudocode
STD_MOCKS REQ(game_id, system_key, planet_name, troop_count)
T401 T400(game_id) T400(planet_name) T400(troop_count=0) T404_PLAYER TCORS
T409_ACTIVATED
T409('planet not in tile')
T409('must resolve bombardment phase') — mock bombDefs=[{name:'dreadnought'}], bombardment_done=false

GIVEN no defenders, no bombardment ships
  EXPECT game_player_units.upsert called with on_planet=planet_name
  EXPECT game_player_planets.upsert called (CLAIM_PLANET)
  EXPECT response { claimed: true }

GIVEN defenders present, defender has PDS (space_cannon IS NOT NULL)
  EXPECT game_combats.insert called with { combat_type: 'ground', phase: 'scd_fire' }
  EXPECT game_player_planets.upsert NOT called
  EXPECT response { combat_id: string }

GIVEN defenders present, no SCD units on planet
  EXPECT game_combats.insert called with { phase: 'attacker_roll' }
  EXPECT response { combat_id: string }

GIVEN bombardment_done=true, bombDefs=[{name:'dreadnought'}]  // skip guard passes
  EXPECT proceeds normally

GIVEN system_key='0,0', custodians_claimed=false, no defenders
  EXPECT custodians awarded (VP+1, agenda_unlocked=true)

GIVEN system_key='0,0', defenders present
  EXPECT custodians NOT awarded
```
