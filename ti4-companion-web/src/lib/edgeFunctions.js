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

export const drawAgenda = (gameId) =>
  callFunction('game-draw-agenda', { game_id: gameId })

export const castVotes = (gameId, payload) =>
  callFunction('game-cast-votes', { game_id: gameId, ...payload })

export const resolveAgenda = (gameId, agendaId, electedTarget) =>
  callFunction('game-resolve-agenda', { game_id: gameId, agenda_id: agendaId, elected_target: electedTarget })

export const createTransaction = (gameId, toPlayerId, offer, request) =>
  callFunction('game-create-transaction', { game_id: gameId, to_player_id: toPlayerId, offer, request })

export const confirmTransaction = (gameId, transactionId) =>
  callFunction('game-confirm-transaction', { game_id: gameId, transaction_id: transactionId })

export const rejectTransaction = (gameId, transactionId) =>
  callFunction('game-reject-transaction', { game_id: gameId, transaction_id: transactionId })

export const rescindTransaction = (gameId, transactionId) =>
  callFunction('game-rescind-transaction', { game_id: gameId, transaction_id: transactionId })

export const playPromissoryNote = (gameId, noteInstanceId, planetName) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(planetName ? { planet_name: planetName } : {}),
  })

export const activateSystem = (gameId, systemKey) =>
  callFunction('game-activate-system', { game_id: gameId, system_key: systemKey })

export const landTroops = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-land-troops', { game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount })

export const fireSpaceCannon = (gameId, combatId, pass) =>
  callFunction('game-fire-space-cannon', { game_id: gameId, combat_id: combatId, pass })

export const rollCombatDice = (gameId, combatId) =>
  callFunction('game-roll-combat-dice', { game_id: gameId, combat_id: combatId })

export const assignHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-hits', { game_id: gameId, combat_id: combatId, casualties })

export const declareRetreat = (gameId, combatId, destination) =>
  callFunction('game-declare-retreat', { game_id: gameId, combat_id: combatId, destination })

export const rollGroundCombatDice = (gameId, combatId) =>
  callFunction('game-roll-ground-combat-dice', { game_id: gameId, combat_id: combatId })

export const playStrategyCard = (gameId, abilityDefinitionId, selections) =>
  callFunction('game-play-strategy-card', { game_id: gameId, ability_definition_id: abilityDefinitionId, selections })

export const useStrategySecondary = (gameId, playId, abilityDefinitionId, selections) =>
  callFunction('game-use-strategy-secondary', { game_id: gameId, play_id: playId, ability_definition_id: abilityDefinitionId, selections })

export const passStrategySecondary = (gameId, playId) =>
  callFunction('game-pass-strategy-secondary', { game_id: gameId, play_id: playId })

export const produceUnits = (gameId, systemKey, units, planetExhausts) =>
  callFunction('game-produce-units', { game_id: gameId, system_key: systemKey, units, planet_exhausts: planetExhausts })

// Phase 18
export const moveShips = (gameId, payload) =>
  callFunction('game-move-ships', { game_id: gameId, ...payload })

// Phase 23
export const updateRecord = (table, record) =>
  callFunction('admin-update-record', { table, record })

// Phase 25
export const rollRiftDice = (transitId, rollAll, unitId) =>
  callFunction('game-roll-rift-dice', { transit_id: transitId, roll_all: rollAll, unit_id: unitId })

// Phase 29a
export const playActionCard = (gameId, cardId, selections) =>
  callFunction('game-play-action-card', { game_id: gameId, card_id: cardId, selections })

export const passActionWindow = (gameId, combatId) =>
  callFunction('game-pass-action-window', { game_id: gameId, combat_id: combatId })

// Phase 13
export const fireAntiFighterBarrage = (gameId, combatId) =>
  callFunction('game-fire-anti-fighter-barrage', { game_id: gameId, combat_id: combatId })

export const advanceBarrage = (gameId, combatId) =>
  callFunction('game-advance-barrage', { game_id: gameId, combat_id: combatId })

// Phase 14
export const fireBombardment = (gameId, systemKey, planetName) =>
  callFunction('game-fire-bombardment', { game_id: gameId, system_key: systemKey, planet_name: planetName })

export const advanceBombardment = (gameId, systemKey) =>
  callFunction('game-advance-bombardment', { game_id: gameId, system_key: systemKey })

export const commitGroundForces = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-commit-ground-forces', { game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount })

export const fireSpaceCannonDefense = (gameId, combatId) =>
  callFunction('game-fire-space-cannon-defense', { game_id: gameId, combat_id: combatId })

// Phase 17
export const explorePlanet = (gameId, playerId, planetName, deckType) =>
  callFunction('game-explore-planet', { game_id: gameId, player_id: playerId, planet_name: planetName, deck_type: deckType })

export const resolveExplorationCard = (gameId, playerId, cardId, opts = {}) =>
  callFunction('game-resolve-exploration-card', { game_id: gameId, player_id: playerId, card_id: cardId, ...opts })

export const exploreFrontier = (gameId, playerId, systemKey) =>
  callFunction('game-explore-frontier', { game_id: gameId, player_id: playerId, system_key: systemKey })

export const useRelicFragment = (gameId, playerId, fragmentIds) =>
  callFunction('game-use-relic-fragment', { game_id: gameId, player_id: playerId, fragment_ids: fragmentIds })

export const useRelic = (gameId, playerId, relicId, choice) =>
  callFunction('game-use-relic', { game_id: gameId, player_id: playerId, relic_id: relicId, choice })

// Phase 20
export const playCombatActionCard = (gameId, combatId, cardId, targets) =>
  callFunction('game-play-combat-action-card', { game_id: gameId, combat_id: combatId, card_id: cardId, targets })

// Phase 21
export const exhaustLegendaryCard = (gameId, planetName, choice) =>
  callFunction('game-resolve-ability', {
    game_id: gameId,
    source_type: 'legendary_card',
    source_id: planetName,
    selections: { choice },
  })

// Phase 30
export const exhaustTechnology = (gameId, technologyName) =>
  callFunction('game-exhaust-technology', { game_id: gameId, technology_name: technologyName })

export const readyTechnology = (gameId, technologyName) =>
  callFunction('game-ready-technology', { game_id: gameId, technology_name: technologyName })

export const useTechnologyAction = (gameId, technologyName, selections) =>
  callFunction('game-use-technology-action', { game_id: gameId, technology_name: technologyName, selections })

// Phase 33 additions:
export const addBot = (gameId, displayName, faction, color, botStrategy) =>
  callFunction('game-add-bot', { game_id: gameId, display_name: displayName, faction, color, bot_strategy: botStrategy })

export const removeBot = (gameId, botPlayerId) =>
  callFunction('game-remove-bot', { game_id: gameId, bot_player_id: botPlayerId })

export const undoLastAction = (gameId) =>
  callFunction('game-undo', { game_id: gameId })

export { callFunction }
