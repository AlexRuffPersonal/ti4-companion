import { useMemo } from 'react'

export function useAbilities(currentEvent, playerSources, allAbilityDefinitions) {
  const triggerable = useMemo(() => {
    if (!currentEvent || !allAbilityDefinitions?.length || !playerSources) return []

    return allAbilityDefinitions.filter(ability => {
      const trigger = ability.trigger
      if (!trigger || trigger.event !== currentEvent.type) return false

      const owner = trigger.owner ?? 'self'
      if (owner === 'self' && currentEvent.triggeredByPlayerId !== null &&
          currentEvent.triggeredByPlayerId !== playerSources.playerId) return false
      if (owner === 'other' && currentEvent.triggeredByPlayerId === playerSources.playerId) return false

      return (ability.ability_sources ?? []).some(source => {
        switch (source.source_type) {
          case 'action_card':      return playerSources.actionCardIds?.includes(source.source_id)
          case 'faction_ability':  return source.faction_name === playerSources.factionName
          case 'leader':           return playerSources.leaderIds?.includes(source.source_id)
          case 'relic':            return playerSources.relicIds?.includes(source.source_id)
          case 'promissory_note':  return playerSources.promissoryNoteIds?.includes(source.source_id)
          case 'technology':       return playerSources.technologyIds?.includes(source.source_id)
          case 'exploration_card': return playerSources.explorationCardIds?.includes(source.source_id)
          default:                 return false
        }
      })
    })
  }, [currentEvent, playerSources, allAbilityDefinitions])

  const unlockable = useMemo(() => {
    if (!allAbilityDefinitions?.length || !playerSources) return []

    return allAbilityDefinitions.filter(ability => {
      if (!ability.unlock_conditions?.length) return false
      if (!playerSources.lockedCommanderAbilityIds?.includes(ability.id)) return false

      return ability.unlock_conditions.every(condition => {
        switch (condition.check) {
          case 'scored_objectives': return (playerSources.scoredObjectivesCount ?? 0) >= condition.gte
          case 'tech_count':        return (playerSources.technologyIds?.length ?? 0) >= condition.gte
          case 'vp_count':          return (playerSources.vp ?? 0) >= condition.gte
          default:                  return false
        }
      })
    })
  }, [playerSources, allAbilityDefinitions])

  return { triggerable, unlockable }
}
