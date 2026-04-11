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
      const responseBody = await error.context.json().catch(() => ({}))
      throw new Error(responseBody.error ?? error.message)
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

export { callFunction }
