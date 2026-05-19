# shared-commanderUnlock
**File:** `supabase/functions/_shared/commanderUnlock.ts`
**Status:** New
**Prereqs:** migration-052-leader-abilities

## Functionality
```pseudocode
export async function checkCommanderUnlock(
  faction: string, gameId: string, player: GamePlayer, db: SupabaseClient
): Promise<boolean>

  switch faction:
    case 'The Mahact Gene-Sorcerers':
      // COUNT DISTINCT factions of captured tokens in fleet pool
      rows = fetch game_system_activations WHERE game_id + token_owner_id != player.id
               AND player_id=player.id
      distinctFactions = COUNT DISTINCT token_owner_id in rows
      return distinctFactions >= 2

    case 'The Argent Flight':
      // COUNT units capable of AFB/Space Cannon/Bombardment
      capableTypes = ['destroyer','cruiser','pds','war_sun','flagship','dreadnought'] // those with unit abilities
      count = SUM game_player_units.count WHERE game_id + player_id + unit_type IN capableTypes
      return count >= 6

    case 'The Nekro Virus':
      return player.technologies.length >= 3

    case 'The Titans Of Ul':
      spaceDocks = COUNT game_player_planets WHERE game_id + player_id + space_dock_unit_id IS NOT NULL
      pds = SUM pds_count FROM game_player_planets WHERE game_id + player_id
      return spaceDocks + pds >= 5

    case 'The Vuil\'raith Cabal':
      riftSystems = SELECT DISTINCT game_player_units.system_key
                    JOIN tiles ON tile type has gravity_rift
                    WHERE game_player_units.game_id + player_id
      return riftSystems.length >= 3

    case 'The Embers Of Muaat':
      warsun = fetch game_player_units WHERE game_id + player_id + unit_type='war_sun' LIMIT 1
      return warsun EXISTS

    case 'The L1Z1X Mindnet':
      count = SUM game_player_units.count WHERE game_id + player_id + unit_type='dreadnought'
      return count >= 4

    case 'The Naaz-Rokha Alliance':
      mechSystems = COUNT DISTINCT system_key FROM game_player_units
                    WHERE game_id + player_id + unit_type='mech'
      return mechSystems >= 3

    case 'The Federation Of Sol':
      totalRes = SUM tiles.planets[name].resources WHERE game_player_planets game_id + player_id
      return totalRes >= 12

    case 'The Clan Of Saar':
      docks = COUNT game_player_planets WHERE game_id + player_id + space_dock_unit_id IS NOT NULL
      return docks >= 3

    case 'The Barony Of Letnev':
      // MAX non-fighter ships in any single system
      maxInSystem = SELECT MAX(total) FROM (
        SELECT system_key, SUM(count) as total FROM game_player_units
        WHERE game_id + player_id + unit_type NOT IN ('fighter','infantry','mech')
        GROUP BY system_key
      )
      return maxInSystem >= 5

    case 'The Universities Of Jol-Nar':
      return player.technologies.length >= 8

    case 'The Yin Brotherhood':
      return player.commander_flags?.used_indoctrination === true

    case 'The Emirates Of Hacan':
      return player.trade_goods >= 10

    case 'The Winnu':
      // Controls Mecatol Rex OR entered combat there
      mecatol = fetch game_player_planets WHERE game_id + player_id + planet_name='Mecatol Rex' LIMIT 1
      return mecatol EXISTS OR player.commander_flags?.entered_mecatol_combat === true

    case 'The Nomad':
      secCount = COUNT game_player_secret_objectives WHERE game_id + player_id + state='scored'
      return secCount >= 1

    case 'The Yssaril Tribes':
      return player.action_card_count >= 7

    case 'The Arborec':
      total = SUM game_player_units.count WHERE game_id + player_id
               + unit_type IN ('infantry','mech') + on_planet IS NOT NULL
      return total >= 12

    case 'The Naalu Collective':
      total = SUM game_player_units.count WHERE game_id + player_id + unit_type='fighter'
      return total >= 12

    case 'The Xxcha Kingdom':
      totalInf = SUM tiles.planets[name].influence WHERE game_player_planets game_id + player_id
      return totalInf >= 12

    case 'The Mentak Coalition':
      total = SUM game_player_units.count WHERE game_id + player_id + unit_type='cruiser'
      return total >= 4

    case 'The Empyrean':
      // All other active players share a system border with this player
      playerSystems = DISTINCT system_key FROM game_player_units WHERE game_id + player_id
      otherPlayers = game_players WHERE game_id + id != player.id + eliminated=false
      for each otherPlayer:
        otherSystems = DISTINCT system_key FROM game_player_units WHERE game_id + player_id=otherPlayer.id
        adjacent = any system in otherSystems is adjacent to any system in playerSystems (use map_tiles adjacency)
        if NOT adjacent: return false
      return true

    case 'Sardakk N\'orr':
      homeTile = fetch tiles WHERE faction='Sardakk N\'orr' AND is_home=true
      nonHome = fetch game_player_planets WHERE game_id + player_id
                + tile_id != homeTile.id
      return nonHome.length >= 5

    case 'The Ghosts Of Creuss':
      wormholeSystems = SELECT DISTINCT gpu.system_key FROM game_player_units gpu
                        JOIN game_system_state gss ON gss.game_id=gpu.game_id AND gss.system_key=gpu.system_key
                        WHERE gpu.game_id + gpu.player_id + gss.wormholes && ARRAY['alpha','beta']
      return wormholeSystems.length >= 3

    default: return false
```

## Tests
```pseudocode
// tests/functions/game-unlock-commander.test.js
STD_MOCKS

describe('Nekro'):
  it('returns false when < 3 techs')
  it('returns true when >= 3 techs')

describe('Hacan'):
  it('returns false when < 10 trade goods')
  it('returns true when >= 10 trade goods')

describe('Sol'):
  it('returns false when total resources < 12')
  it('returns true when total resources >= 12')

describe('Yin honour flag'):
  it('returns false when used_indoctrination not set')
  it('returns true when commander_flags.used_indoctrination=true')
```
