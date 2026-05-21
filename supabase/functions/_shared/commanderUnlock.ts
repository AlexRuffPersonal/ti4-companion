import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type GamePlayer = Record<string, unknown>

/**
 * Check whether a faction's commander unlock condition is met.
 * Returns true if the condition is satisfied, false otherwise.
 */
export async function checkCommanderUnlock(
  faction: string,
  gameId: string,
  player: GamePlayer,
  db: SupabaseClient,
): Promise<boolean> {
  const playerId = player.id as string
  const technologies = (player.technologies as string[]) ?? []
  const commanderFlags = (player.commander_flags as Record<string, unknown>) ?? {}

  switch (faction) {
    case 'The Mahact Gene-Sorcerers': {
      // COUNT DISTINCT factions of captured tokens in fleet pool
      const { data: rows } = await db
        .from('game_system_activations')
        .select('token_owner_id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .neq('token_owner_id', playerId)
      const distinctFactions = new Set((rows ?? []).map((r: Record<string, string>) => r.token_owner_id))
      return distinctFactions.size >= 2
    }

    case 'The Argent Flight': {
      // COUNT units capable of AFB/Space Cannon/Bombardment
      const capableTypes = ['destroyer', 'cruiser', 'pds', 'war_sun', 'flagship', 'dreadnought']
      const { data: units } = await db
        .from('game_player_units')
        .select('count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .in('unit_type', capableTypes)
      const count = (units ?? []).reduce((sum: number, u: Record<string, number>) => sum + (u.count ?? 0), 0)
      return count >= 6
    }

    case 'The Nekro Virus': {
      return technologies.length >= 3
    }

    case 'The Titans Of Ul': {
      const { data: planets } = await db
        .from('game_player_planets')
        .select('space_dock_unit_id, pds_count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      const spaceDocks = (planets ?? []).filter((p: Record<string, unknown>) => p.space_dock_unit_id != null).length
      const pds = (planets ?? []).reduce((sum: number, p: Record<string, unknown>) => sum + ((p.pds_count as number) ?? 0), 0)
      return (spaceDocks + pds) >= 5
    }

    case "The Vuil'raith Cabal": {
      // Distinct systems with gravity rift that have player units
      const { data: unitSystems } = await db
        .from('game_player_units')
        .select('system_key, tiles!inner(type)')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      // Filter to gravity rift systems
      const riftSystems = new Set(
        (unitSystems ?? [])
          .filter((u: Record<string, unknown>) => {
            const tile = u.tiles as Record<string, string>
            return tile?.type === 'gravity_rift'
          })
          .map((u: Record<string, string>) => u.system_key),
      )
      return riftSystems.size >= 3
    }

    case 'The Embers Of Muaat': {
      const { data: warsun } = await db
        .from('game_player_units')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('unit_type', 'war_sun')
        .limit(1)
      return ((warsun ?? []).length) > 0
    }

    case 'The L1Z1X Mindnet': {
      const { data: units } = await db
        .from('game_player_units')
        .select('count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('unit_type', 'dreadnought')
      const count = (units ?? []).reduce((sum: number, u: Record<string, number>) => sum + (u.count ?? 0), 0)
      return count >= 4
    }

    case 'The Naaz-Rokha Alliance': {
      const { data: mechUnits } = await db
        .from('game_player_units')
        .select('system_key')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('unit_type', 'mech')
      const mechSystems = new Set((mechUnits ?? []).map((u: Record<string, string>) => u.system_key))
      return mechSystems.size >= 3
    }

    case 'The Federation Of Sol': {
      // Total resources of controlled planets
      const { data: playerPlanets } = await db
        .from('game_player_planets')
        .select('planet_name, tiles!inner(planets)')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      let totalRes = 0
      for (const row of (playerPlanets ?? [])) {
        const r = row as Record<string, unknown>
        const tileData = r.tiles as Record<string, unknown>
        const planets = (tileData?.planets as Record<string, Record<string, number>>) ?? {}
        const planetName = r.planet_name as string
        totalRes += planets[planetName]?.resources ?? 0
      }
      return totalRes >= 12
    }

    case 'The Clan Of Saar': {
      const { data: dockPlanets } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .not('space_dock_unit_id', 'is', null)
      return ((dockPlanets ?? []).length) >= 3
    }

    case 'The Barony Of Letnev': {
      // MAX non-fighter/infantry/mech ships in any single system
      const { data: shipUnits } = await db
        .from('game_player_units')
        .select('system_key, count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .not('unit_type', 'in', '("fighter","infantry","mech")')
      const systemTotals = new Map<string, number>()
      for (const u of (shipUnits ?? [])) {
        const unit = u as Record<string, unknown>
        const key = unit.system_key as string
        systemTotals.set(key, (systemTotals.get(key) ?? 0) + ((unit.count as number) ?? 0))
      }
      const maxInSystem = Math.max(0, ...systemTotals.values())
      return maxInSystem >= 5
    }

    case 'The Universities Of Jol-Nar': {
      return technologies.length >= 8
    }

    case 'The Yin Brotherhood': {
      return commanderFlags['used_indoctrination'] === true
    }

    case 'The Emirates Of Hacan': {
      return ((player.trade_goods as number) ?? 0) >= 10
    }

    case 'The Winnu': {
      const { data: mecatol } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('planet_name', 'Mecatol Rex')
        .limit(1)
      return ((mecatol ?? []).length > 0) || (commanderFlags['entered_mecatol_combat'] === true)
    }

    case 'The Nomad': {
      const { data: secrets } = await db
        .from('game_player_secret_objectives')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('state', 'scored')
      return ((secrets ?? []).length) >= 1
    }

    case 'The Yssaril Tribes': {
      return ((player.action_card_count as number) ?? 0) >= 7
    }

    case 'The Arborec': {
      const { data: groundUnits } = await db
        .from('game_player_units')
        .select('count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .in('unit_type', ['infantry', 'mech'])
        .not('on_planet', 'is', null)
      const total = (groundUnits ?? []).reduce((sum: number, u: Record<string, number>) => sum + (u.count ?? 0), 0)
      return total >= 12
    }

    case 'The Naalu Collective': {
      const { data: fighters } = await db
        .from('game_player_units')
        .select('count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('unit_type', 'fighter')
      const total = (fighters ?? []).reduce((sum: number, u: Record<string, number>) => sum + (u.count ?? 0), 0)
      return total >= 12
    }

    case 'The Xxcha Kingdom': {
      // Total influence of controlled planets
      const { data: playerPlanets } = await db
        .from('game_player_planets')
        .select('planet_name, tiles!inner(planets)')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      let totalInf = 0
      for (const row of (playerPlanets ?? [])) {
        const r = row as Record<string, unknown>
        const tileData = r.tiles as Record<string, unknown>
        const planets = (tileData?.planets as Record<string, Record<string, number>>) ?? {}
        const planetName = r.planet_name as string
        totalInf += planets[planetName]?.influence ?? 0
      }
      return totalInf >= 12
    }

    case 'The Mentak Coalition': {
      const { data: cruisers } = await db
        .from('game_player_units')
        .select('count')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .eq('unit_type', 'cruiser')
      const total = (cruisers ?? []).reduce((sum: number, u: Record<string, number>) => sum + (u.count ?? 0), 0)
      return total >= 4
    }

    case 'The Empyrean': {
      // All other active players share a system border with this player
      // (adjacency check — simplified: we check if there exists any shared system key)
      const { data: playerUnits } = await db
        .from('game_player_units')
        .select('system_key')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      const playerSystems = new Set((playerUnits ?? []).map((u: Record<string, string>) => u.system_key))

      const { data: otherPlayers } = await db
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .neq('id', playerId)
        .eq('eliminated', false)

      for (const other of (otherPlayers ?? [])) {
        const otherId = (other as Record<string, string>).id
        const { data: otherUnits } = await db
          .from('game_player_units')
          .select('system_key')
          .eq('game_id', gameId)
          .eq('player_id', otherId)
        const otherSystems = new Set((otherUnits ?? []).map((u: Record<string, string>) => u.system_key))
        // Check adjacency: share at least one system key (simplified)
        const adjacent = [...otherSystems].some((s) => playerSystems.has(s))
        if (!adjacent) return false
      }
      return true
    }

    case "Sardakk N'orr": {
      // Controls 5+ planets NOT on home tile
      const { data: homeTile } = await db
        .from('tiles')
        .select('id')
        .eq('faction', "Sardakk N'orr")
        .eq('is_home', true)
        .maybeSingle()
      if (!homeTile) return false
      const { data: nonHomePlanets } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .neq('tile_id', (homeTile as Record<string, string>).id)
      return ((nonHomePlanets ?? []).length) >= 5
    }

    case 'The Ghosts Of Creuss': {
      // 3+ distinct wormhole systems (alpha or beta) with player units
      const { data: wormholeSystems } = await db
        .from('game_player_units')
        .select('system_key, game_system_state!inner(wormholes)')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      const validSystems = new Set(
        (wormholeSystems ?? [])
          .filter((u: Record<string, unknown>) => {
            const gss = u.game_system_state as Record<string, unknown>
            const wormholes = (gss?.wormholes as string[]) ?? []
            return wormholes.includes('alpha') || wormholes.includes('beta')
          })
          .map((u: Record<string, string>) => u.system_key),
      )
      return validSystems.size >= 3
    }

    default:
      return false
  }
}
