import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

/**
 * Call a Supabase Edge Function and throw on error.
 * For FunctionsHttpError, reads the domain error message from the response body
 * rather than using the generic SDK message ("Edge Function returned a non-2xx status code").
 * @param {string} name - function name
 * @param {object} body - request payload
 * @returns {Promise<object>} response data
 */
async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const raw = await error.context.text().catch(() => '')
      let message = error.message
      try {
        const body = JSON.parse(raw)
        message = (body.error ?? body.message ?? raw) || error.message
      } catch {
        message = raw || error.message
      }
      throw new Error(message)
    }
    throw new Error(error.message)
  }
  return data
}

export const importTable = (table, records) =>
  callFunction(`admin-import-${table}`, { records })

export const createGame = () =>
  callFunction('game-create', {})

export const joinGame = (code) =>
  callFunction('game-join', { code })

export const updateGameSettings = (gameId, settings) =>
  callFunction('game-update-settings', { game_id: gameId, ...settings })

export const pickFactionColor = (gameId, faction, colour) =>
  callFunction('game-pick-faction-color', { game_id: gameId, faction, colour })

export const setSpeaker = (gameId, playerId) =>
  callFunction('game-set-speaker', { game_id: gameId, player_id: playerId })

export const startGame = (gameId) =>
  callFunction('game-start', { game_id: gameId })

export const endTurn = (gameId) =>
  callFunction('game-end-turn', { game_id: gameId })

export const passAction = (gameId) =>
  callFunction('game-player-pass', { game_id: gameId })

export const advancePhase = (gameId) =>
  callFunction('game-advance-phase', { game_id: gameId })

export const scoreObjective = (gameId, objectiveId, playerId) =>
  callFunction('game-score-objective', { game_id: gameId, objective_id: objectiveId, player_id: playerId })

export const revealObjective = (gameId, stage) =>
  callFunction('game-reveal-objective', { game_id: gameId, stage })

export const shuffleDeck = (gameId, deckType) =>
  callFunction('game-shuffle-deck', { game_id: gameId, deck_type: deckType })

export const updateCommandTokens = (gameId, tokens) =>
  callFunction('game-update-command-tokens', { game_id: gameId, ...tokens })

export const drawActionCard = (gameId) =>
  callFunction('game-draw-action-card', { game_id: gameId })

export const discardActionCard = (gameId, cardId) =>
  callFunction('game-discard-action-card', { game_id: gameId, card_id: cardId })

export const researchTechnology = (gameId, techName, exhaustPlanetIds = [], bypassPrerequisites = false) =>
  callFunction('game-research-technology', {
    game_id: gameId,
    tech_name: techName,
    exhaust_planet_ids: exhaustPlanetIds,
    bypass_prerequisites: bypassPrerequisites,
  })

export const resolveAbility = (gameId, abilityDefinitionId, sourceType, sourceId, selections = {}) =>
  callFunction('game-resolve-ability', {
    game_id: gameId,
    ability_definition_id: abilityDefinitionId,
    source_type: sourceType,
    source_id: sourceId,
    selections,
  })

export const unlockCommander = (gameId, abilityDefinitionId) =>
  callFunction('game-unlock-commander', {
    game_id: gameId,
    ability_definition_id: abilityDefinitionId,
  })

export const discardSecretObjective = (gameId, objectiveId) =>
  callFunction('game-discard-secret-objective', { game_id: gameId, objective_id: objectiveId })

export const scoreSecretObjective = (gameId, objectiveId) =>
  callFunction('game-score-secret-objective', { game_id: gameId, objective_id: objectiveId })

export const statusPhase = (gameId) =>
  callFunction('game-status-phase', { game_id: gameId })

export { callFunction }
