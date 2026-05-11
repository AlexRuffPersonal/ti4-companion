import { exhaustTechnology, readyTechnology, useTechnologyAction } from '../lib/edgeFunctions.js'

export function useTechnologies(player, gameId) {
  const ownedTechnologies = player?.technologies ?? []
  const exhaustedTechnologies = player?.exhausted_technologies ?? []

  const isExhausted = (name) => exhaustedTechnologies.includes(name)
  const exhaustTech = (name) => exhaustTechnology(gameId, name)
  const readyTech = (name) => readyTechnology(gameId, name)
  const useTechAction = (name, selections) => useTechnologyAction(gameId, name, selections)

  return { ownedTechnologies, exhaustedTechnologies, isExhausted, exhaustTech, readyTech, useTechAction }
}
