import { supabase } from './supabase.js'

/**
 * Call a Supabase Edge Function and throw on error.
 * @param {string} name - function name
 * @param {object} body - request payload
 * @returns {Promise<object>} response data
 */
async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  return data
}

export const importTable = (table, records) =>
  callFunction(`admin-import-${table}`, { records })

export { callFunction }
