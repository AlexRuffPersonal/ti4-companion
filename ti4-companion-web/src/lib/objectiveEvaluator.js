/**
 * Client-side objective condition evaluator.
 * Mirrors the TypeScript evaluateCondition function from server-side objectiveConditions.ts
 */

/**
 * Evaluates whether a player meets a condition for objective eligibility.
 *
 * @param {Object|null} conditionCheck - { type: string, params: Record<string, unknown> } or null
 * @param {Object} ctx - EvaluationContext (player, planets, units, homeSystems, mecatolSystemKey, combats, neighbors, technologies)
 * @returns {{eligible: boolean, reason: string}}
 */
export function evaluateCondition(conditionCheck, ctx) {
  if (!conditionCheck) {
    return { eligible: true, reason: '' }
  }

  const { type, params } = conditionCheck

  switch (type) {
    case 'count_planets': {
      const min = params.min
      const filter = params.filter
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
      const min = params.min
      const colors = params.colors
      const perColor = params.per_color
      const filter = params.filter

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
        const colorCounts = {}
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
      const unit = params.unit
      const min = params.min
      const location = params.location
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
      const min = params.min
      const systemKeys = new Set(ctx.units.map(u => u.system_key))
      const count = systemKeys.size
      return count >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need units in ${min} systems, have ${count}` }
    }

    case 'count_command_tokens': {
      const pool = params.pool
      const min = params.min
      const count = ctx.player.command_tokens[pool] ?? 0
      return count >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} ${pool} tokens, have ${count}` }
    }

    case 'planet_stat_total': {
      const stat = params.stat
      const min = params.min
      const total = ctx.planets.reduce((sum, p) => sum + (p[stat] ?? 0), 0)
      return total >= min
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${min} total ${stat}, have ${total}` }
    }

    case 'control_mecatol': {
      const hasMecatol = ctx.planets.some(p => p.planet_name === 'Mecatol Rex')
      return hasMecatol
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: 'Must control Mecatol Rex' }
    }

    case 'spend_resources': {
      const amount = params.amount
      const total = ctx.planets
        .filter(p => !p.exhausted)
        .reduce((sum, p) => sum + (p.resources ?? 0), 0)
      return total >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} resources to spend, have ${total} available` }
    }

    case 'spend_influence': {
      const amount = params.amount
      const total = ctx.planets
        .filter(p => !p.exhausted)
        .reduce((sum, p) => sum + (p.influence ?? 0), 0)
      return total >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} influence to spend, have ${total} available` }
    }

    case 'spend_trade_goods': {
      const amount = params.amount
      return ctx.player.trade_goods >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} trade goods, have ${ctx.player.trade_goods}` }
    }

    case 'spend_command_tokens': {
      const pool = params.pool
      const amount = params.amount
      const count = ctx.player.command_tokens[pool] ?? 0
      return count >= amount
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: `Need ${amount} ${pool} tokens to spend, have ${count}` }
    }

    case 'won_combat': {
      const combatType = params.combat_type
      const vsNeighbor = params.vs_neighbor
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
      const min = params.min
      const shipType = params.ship_type
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
