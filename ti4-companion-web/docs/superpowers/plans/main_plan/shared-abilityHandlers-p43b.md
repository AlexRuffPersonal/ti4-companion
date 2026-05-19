# shared-abilityHandlers-p43b
**File:** `supabase/functions/_shared/abilityHandlers.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43b

## Changes
Register all named handlers for complex hero abilities.

```pseudocode
'creuss_riftwalker': async (context, db) => {
  [key1, key2] = context.selections.system_keys  // 2 system keys chosen by player
  ERR 409 'Cannot swap Creuss home or Wormhole Nexus' if either key is Creuss home or nexus
  fetch game WHERE id=gameId → { map_tiles }
  ERR 409 'System not found in map' if either key missing from map_tiles
  tile1 = map_tiles[key1]; tile2 = map_tiles[key2]
  newTiles = { ...map_tiles, [key1]: tile2, [key2]: tile1 }
  UPDATE games SET map_tiles = newTiles WHERE id=gameId
}

'mahact_hero': async (context, db) => {
  sourceSystemKey = context.selections.source_system_key
  destSystemKey = context.selections.dest_system_key
  targetPlayerId = context.selections.target_player_id
  // Move all activating player's units from source space area to dest
  fetch game_player_units WHERE game_id + player_id=activatingPlayerId + system_key=sourceSystemKey + on_planet IS NULL
  for each unit:
    UPDATE game_player_units SET system_key=destSystemKey WHERE id=unit.id
  // Initiate combat context in dest system
  INSERT game_combats { game_id, system_key:destSystemKey, attacker_player_id:activatingPlayerId,
    defender_player_id:targetPlayerId, combat_phase:'pre_combat', no_retreat:true, no_movement_abilities:true }
  OK includes { combat_started: true, combat_system: destSystemKey }
}

'letnev_darktalon': async (context, db) => {
  UPDATE games SET game_round_flags = jsonb_set(game_round_flags, '{letnev_no_fleet_limit}', 'true')
    WHERE id=gameId
  // Note: no purge write; fn-game-resolve-ability-p43b handles purge after this handler
}

'nomad_ahk_syl': async (context, db) => {
  UPDATE games SET game_round_flags = jsonb_set(game_round_flags, '{nomad_flagship_ignores_tokens}', 'true')
    WHERE id=gameId
}

'winnu_mathis': async (context, db) => {
  strategyCardId = context.selections.strategy_card_id
  secondaryPlayerIds = context.selections.chosen_player_ids  // players who perform secondary
  // Apply strategy card primary for activating player via existing strategy card logic
  // Then for each chosen player, mark them as eligible for secondary
  INSERT game_strategy_card_plays { game_id, card_id:strategyCardId, played_by:activatingPlayerId,
    status:'winnu_mathis_override' }
  for each secondaryPlayerId: mark secondary pending
}

'titans_hero': async (context, db) => {
  // Attach card to Elysium: +3 res/inf + Space Cannon 5(x3)
  UPDATE game_player_planets
    SET titans_hero_attached = true,
        resource_bonus = 3,
        influence_bonus = 3,
        space_cannon_override = '5(x3)'
    WHERE game_id=gameId AND planet_name='Elysium'
  // No purge write — fn-game-resolve-ability skips purge for Titans
}

'vuil_raith_hero': async (context, db) => {
  // All players roll for each non-fighter ship in/adjacent to dimensional tear systems
  tearSystems = fetch game_system_state WHERE game_id + dimensional_tear=true → system_keys
  adjacentSystems = compute adjacency for each tear system
  allTargetSystems = union(tearSystems, adjacentSystems)
  results = []
  for each game_player (excluding activating player):
    ships = fetch game_player_units WHERE game_id + player_id + system_key IN allTargetSystems
              + unit_type != 'fighter'
    for each ship: roll = Math.floor(Math.random()*10)+1; captured = roll <= 3
    if captured: record capture (add to activatingPlayer's fleet or store as captured units)
    results.push({ player_id, rolls: [...] })
  OK includes { capture_results: results }
}

// ... remaining hero handlers (jol_nar_hero, yin_hero, naaz_rokha_hero, etc.) following same pattern
```

## Tests
Each handler covered in `tests/functions/game-resolve-ability.test.js` via hero resolution path.
```pseudocode
describe('creuss_riftwalker'):
  T409('system not in map')
  T409('cannot swap Creuss home')
  GIVEN two valid wormhole systems: EXPECT map_tiles swapped

describe('letnev_darktalon'):
  EXPECT game_round_flags.letnev_no_fleet_limit set to true

describe('mahact_hero'):
  EXPECT units moved from source to dest system
  EXPECT game_combats row inserted with no_retreat=true
```
