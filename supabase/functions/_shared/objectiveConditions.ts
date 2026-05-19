import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface GamePlayer {
  id: string
  game_id: string
  trade_goods: number
  technologies: string[]
  command_tokens: { tactic_total: number; fleet: number; strategy: number }
  faction: string
}

export interface GamePlayerPlanet {
  planet_name: string
  exhausted: boolean
  tile_id: string
}

export interface TilePlanet {
  name: string
  resources: number
  influence: number
  tech_specialty: string | null
  type: string[]
}

export type GamePlayerPlanetWithTile = GamePlayerPlanet & TilePlanet

export interface GamePlayerUnit {
  id: string
  player_id: string
  game_id: string
  system_key: string
  unit_type: string
  count: number
  on_planet: string | null
}

export interface GameCombat {
  id: string
  winner_player_id: string | null
  attacker_player_id: string
  defender_player_id: string
  combat_type: string
  ships_destroyed: { attacker?: Record<string, number>; defender?: Record<string, number> } | null
}

export interface Technology {
  id: string
  color: string
}

export interface EvaluationContext {
  player: GamePlayer
  planets: GamePlayerPlanetWithTile[]
  units: GamePlayerUnit[]
  homeSystems: Record<string, string>
  mecatolSystemKey: string
  combats: GameCombat[]
  neighbors: string[]
  technologies: Technology[]
}

export interface EligibilityResult {
  eligible: boolean
  reason: string
}

export function evaluateCondition(
  conditionCheck: { type: string; params: Record<string, unknown> } | null,
  ctx: EvaluationContext
): EligibilityResult {
  if (!conditionCheck) return { eligible: true, reason: '' }

  const { type, params } = conditionCheck

  switch (type) {
    case 'count_planets': {
      const min = params.min as number
      const filter = params.filter as string | undefined
      let planets = ctx.planets
      if (filter === 'tech_specialty') {
        planets = planets.filter(p => p.tech_specialty !== null && p.tech_specialty !== '')
      } else if (filter === 'hazardous') {
        planets = planets.filter(p => Array.isArray(p.type) && p.type.includes('hazardous'))
      } else if (filter === 'cultural') {
        planets = planets.filter(p => Array.isArray(p.type) && p.type.includes('cultural'))
      } else if (filter === 'industrial') {
        planets = planets.filter(p => Array.isArray(p.type) && p.type.includes('industrial'))
      }
      const count = planets.length
      return count >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} planets${filter ? ` (${filter})` : ''}, have ${count}` }
    }

    case 'count_technologies': {
      const min = params.min as number | undefined
      const colors = params.colors as number | undefined
      const perColor = params.per_color as number | undefined
      const filter = params.filter as string | undefined

      let techNames = ctx.player.technologies
      if (filter) {
        const matchingNames = new Set(
          ctx.technologies.filter(t => t.color === filter).map(t => t.id)
        )
        techNames = techNames.filter(n => matchingNames.has(n))
      }

      if (min !== undefined && techNames.length < min) {
        return { eligible: false, reason: `Need ${min} technologies, have ${techNames.length}` }
      }

      if (colors !== undefined && perColor !== undefined) {
        const colorCounts: Record<string, number> = {}
        for (const name of ctx.player.technologies) {
          const tech = ctx.technologies.find(t => t.id === name)
          if (tech) {
            colorCounts[tech.color] = (colorCounts[tech.color] ?? 0) + 1
          }
        }
        const distinctColors = Object.keys(colorCounts).length
        const hasColorWithEnough = Object.values(colorCounts).some(c => c >= perColor)
        if (distinctColors < colors || !hasColorWithEnough) {
          return {
            eligible: false,
            reason: `Need ${colors} distinct tech colors with at least one having ${perColor}+, have ${distinctColors} colors`,
          }
        }
      }

      return { eligible: true, reason: '' }
    }

    case 'count_units': {
      const unit = params.unit as string
      const min = params.min as number
      const location = params.location as string | undefined
      let units = ctx.units.filter(u => u.unit_type === unit)
      if (location === 'home_system') {
        const homeKey = ctx.homeSystems[ctx.player.id]
        units = units.filter(u => u.system_key === homeKey)
      }
      const total = units.reduce((sum, u) => sum + u.count, 0)
      return total >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} ${unit}${location ? ` in home system` : ''}, have ${total}` }
    }

    case 'count_systems': {
      const min = params.min as number
      const systemKeys = new Set(ctx.units.map(u => u.system_key))
      const count = systemKeys.size
      return count >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need units in ${min} systems, have ${count}` }
    }

    case 'count_command_tokens': {
      const pool = params.pool as keyof GamePlayer['command_tokens']
      const min = params.min as number
      const count = ctx.player.command_tokens[pool] ?? 0
      return count >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} ${pool} tokens, have ${count}` }
    }

    case 'planet_stat_total': {
      const stat = params.stat as 'resources' | 'influence'
      const min = params.min as number
      const total = ctx.planets.reduce((sum, p) => sum + (p[stat] ?? 0), 0)
      return total >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} total ${stat}, have ${total}` }
    }

    case 'control_mecatol': {
      const controls = ctx.planets.some(p => {
        const unitInSystem = ctx.units.some(u => u.system_key === ctx.mecatolSystemKey)
        return unitInSystem || p.planet_name === 'Mecatol Rex'
      })
      const hasMecatol = ctx.planets.some(p => p.planet_name === 'Mecatol Rex')
      return hasMecatol
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: 'Must control Mecatol Rex' }
    }

    case 'spend_resources': {
      const amount = params.amount as number
      const total = ctx.planets
        .filter(p => !p.exhausted)
        .reduce((sum, p) => sum + (p.resources ?? 0), 0)
      return total >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} resources to spend, have ${total} available` }
    }

    case 'spend_influence': {
      const amount = params.amount as number
      const total = ctx.planets
        .filter(p => !p.exhausted)
        .reduce((sum, p) => sum + (p.influence ?? 0), 0)
      return total >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} influence to spend, have ${total} available` }
    }

    case 'spend_trade_goods': {
      const amount = params.amount as number
      return ctx.player.trade_goods >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} trade goods, have ${ctx.player.trade_goods}` }
    }

    case 'spend_command_tokens': {
      const pool = params.pool as keyof GamePlayer['command_tokens']
      const amount = params.amount as number
      const count = ctx.player.command_tokens[pool] ?? 0
      return count >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} ${pool} tokens to spend, have ${count}` }
    }

    case 'won_combat': {
      const combatType = params.combat_type as string | undefined
      const vsNeighbor = params.vs_neighbor as boolean | undefined
      const won = ctx.combats.some(c => {
        if (c.winner_player_id !== ctx.player.id) return false
        if (combatType && c.combat_type !== combatType) return false
        if (vsNeighbor) {
          const opponent = c.attacker_player_id === ctx.player.id
            ? c.defender_player_id
            : c.attacker_player_id
          if (!ctx.neighbors.includes(opponent)) return false
        }
        return true
      })
      return won
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: 'Must have won a combat' + (vsNeighbor ? ' against a neighbor' : '') }
    }

    case 'destroyed_ships': {
      const min = params.min as number
      const shipType = params.ship_type as string | undefined
      let total = 0
      for (const c of ctx.combats) {
        if (c.attacker_player_id !== ctx.player.id) continue
        const destroyed = c.ships_destroyed?.attacker ?? {}
        if (shipType) {
          total += destroyed[shipType] ?? 0
        } else {
          total += Object.values(destroyed).reduce((s, v) => s + v, 0)
        }
      }
      return total >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need to have destroyed ${min} ships${shipType ? ` (${shipType})` : ''}, destroyed ${total}` }
    }

    default:
      return { eligible: false, reason: `Unknown condition type: ${type}` }
  }
}

export async function applySpendSideEffect(
  type: string,
  params: Record<string, unknown>,
  ctx: EvaluationContext,
  db: SupabaseClient
): Promise<void> {
  switch (type) {
    case 'spend_resources': {
      const amount = params.amount as number
      const available = ctx.planets
        .filter(p => !p.exhausted)
        .sort((a, b) => (a.resources ?? 0) - (b.resources ?? 0))
      let remaining = amount
      for (const planet of available) {
        if (remaining <= 0) break
        const { error } = await db
          .from('game_player_planets')
          .update({ exhausted: true })
          .eq('player_id', ctx.player.id)
          .eq('planet_name', planet.planet_name)
        if (error) throw new Error(`spend_resources: exhaust failed: ${error.message}`)
        remaining -= planet.resources ?? 0
      }
      break
    }

    case 'spend_influence': {
      const amount = params.amount as number
      const available = ctx.planets
        .filter(p => !p.exhausted)
        .sort((a, b) => (a.influence ?? 0) - (b.influence ?? 0))
      let remaining = amount
      for (const planet of available) {
        if (remaining <= 0) break
        const { error } = await db
          .from('game_player_planets')
          .update({ exhausted: true })
          .eq('player_id', ctx.player.id)
          .eq('planet_name', planet.planet_name)
        if (error) throw new Error(`spend_influence: exhaust failed: ${error.message}`)
        remaining -= planet.influence ?? 0
      }
      break
    }

    case 'spend_trade_goods': {
      const amount = params.amount as number
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: ctx.player.trade_goods - amount })
        .eq('id', ctx.player.id)
      if (error) throw new Error(`spend_trade_goods: update failed: ${error.message}`)
      break
    }

    case 'spend_command_tokens': {
      const pool = params.pool as keyof GamePlayer['command_tokens']
      const amount = params.amount as number
      const tokens = { ...ctx.player.command_tokens }
      tokens[pool] = (tokens[pool] ?? 0) - amount
      const { error } = await db
        .from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', ctx.player.id)
      if (error) throw new Error(`spend_command_tokens: update failed: ${error.message}`)
      break
    }

    default:
      break
  }
}

export async function buildEvaluationContext(
  db: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<EvaluationContext> {
  const [
    playerResult,
    planetsResult,
    unitsResult,
    allPlayersResult,
    combatsResult,
    technologiesResult,
    gameResult,
  ] = await Promise.all([
    db.from('game_players')
      .select('id, game_id, trade_goods, technologies, command_tokens, faction')
      .eq('id', playerId)
      .maybeSingle(),
    db.from('game_player_planets')
      .select('planet_name, exhausted, tile_id, tiles(planets)')
      .eq('player_id', playerId)
      .eq('game_id', gameId),
    db.from('game_player_units')
      .select('*')
      .eq('player_id', playerId)
      .eq('game_id', gameId),
    db.from('game_players')
      .select('id, faction')
      .eq('game_id', gameId),
    db.from('game_combats')
      .select('*')
      .eq('game_id', gameId),
    db.from('technologies')
      .select('id, color'),
    db.from('games')
      .select('map_tiles')
      .eq('id', gameId)
      .maybeSingle(),
  ])

  if (playerResult.error || !playerResult.data) throw new Error('buildEvaluationContext: failed to load player')

  const player = playerResult.data as GamePlayer

  const rawPlanets = (planetsResult.data ?? []) as Array<{
    planet_name: string
    exhausted: boolean
    tile_id: string
    tiles: { planets: TilePlanet[] } | null
  }>

  const planets: GamePlayerPlanetWithTile[] = rawPlanets.flatMap(row => {
    const tilePlanets: TilePlanet[] = row.tiles?.planets ?? []
    const match = tilePlanets.find(tp => tp.name === row.planet_name)
    if (!match) return []
    return [{
      planet_name: row.planet_name,
      exhausted: row.exhausted,
      tile_id: row.tile_id,
      name: match.name,
      resources: match.resources,
      influence: match.influence,
      tech_specialty: match.tech_specialty,
      type: match.type,
    }]
  })

  const units = (unitsResult.data ?? []) as GamePlayerUnit[]
  const allPlayers = (allPlayersResult.data ?? []) as Array<{ id: string; faction: string }>
  const combats = (combatsResult.data ?? []) as GameCombat[]
  const technologies = (technologiesResult.data ?? []) as Technology[]

  const neighbors = allPlayers
    .filter(p => p.id !== playerId)
    .map(p => p.id)

  const mapTiles = (gameResult.data as { map_tiles: Record<string, string> } | null)?.map_tiles ?? {}

  let homeSystems: Record<string, string> = {}
  if (Object.keys(mapTiles).length > 0) {
    const tileIds = Object.values(mapTiles)
    const { data: tiles } = await db
      .from('tiles')
      .select('id, faction_key')
      .in('id', tileIds)

    const tileById: Record<string, string | null> = {}
    for (const t of (tiles ?? []) as Array<{ id: string; faction_key: string | null }>) {
      tileById[t.id] = t.faction_key
    }

    for (const [systemKey, tileId] of Object.entries(mapTiles)) {
      const factionKey = tileById[tileId]
      if (!factionKey) continue
      const owningPlayer = allPlayers.find(p => p.faction === factionKey)
      if (owningPlayer) {
        homeSystems[owningPlayer.id] = systemKey
      }
    }
  }

  return {
    player,
    planets,
    units,
    homeSystems,
    mecatolSystemKey: '0,0',
    combats,
    neighbors,
    technologies,
  }
}
