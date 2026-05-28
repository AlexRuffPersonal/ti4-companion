import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Event type constants
export const EVT_END_TURN = 'end_turn'
export const EVT_PLAYER_PASS = 'player_pass'
export const EVT_ADVANCE_PHASE = 'advance_phase'
export const EVT_SCORE_OBJECTIVE = 'score_objective'
export const EVT_SCORE_SECRET = 'score_secret_objective'
export const EVT_RESEARCH_TECH = 'research_technology'
export const EVT_DRAW_ACTION_CARD = 'draw_action_card'
export const EVT_DISCARD_ACTION_CARD = 'discard_action_card'
export const EVT_RESOLVE_ABILITY = 'resolve_ability'
export const EVT_CAST_VOTES = 'cast_votes'
export const EVT_RESOLVE_AGENDA = 'resolve_agenda'
export const EVT_CREATE_TRANSACTION = 'create_transaction'
export const EVT_CONFIRM_TRANSACTION = 'confirm_transaction'
export const EVT_ACTIVATE_SYSTEM = 'activate_system'
export const EVT_LAND_TROOPS = 'land_troops'
export const EVT_FIRE_SPACE_CANNON = 'fire_space_cannon'
export const EVT_ROLL_COMBAT_DICE = 'roll_combat_dice'
export const EVT_ROLL_GROUND_COMBAT_DICE = 'roll_ground_combat_dice'
export const EVT_ASSIGN_HITS = 'assign_hits'
export const EVT_DECLARE_RETREAT = 'declare_retreat'
export const EVT_UPDATE_COMMAND_TOKENS = 'update_command_tokens'
export const EVT_REVEAL_OBJECTIVE = 'reveal_objective'
export const EVT_DRAW_AGENDA = 'draw_agenda'
export const EVT_PLAY_PROMISSORY_NOTE = 'play_promissory_note'
export const EVT_UNDO = 'undo'
export const EVT_DEPLOY_MECH = 'deploy_mech'

// Informational events (no reversible state; undo skips these)
export const INFORMATIONAL_EVENTS = new Set([EVT_ROLL_COMBAT_DICE, EVT_ROLL_GROUND_COMBAT_DICE])

export interface LogEventParams {
  game_id: string
  player_id?: string | null
  event_type: string
  payload: Record<string, unknown>
  round: number
  phase: string
}

/**
 * Inserts a new event row into game_events.
 */
export async function logEvent(db: SupabaseClient, params: LogEventParams): Promise<void> {
  const { error } = await db.from('game_events').insert({
    game_id: params.game_id,
    player_id: params.player_id ?? null,
    event_type: params.event_type,
    payload: params.payload,
    round: params.round,
    phase: params.phase,
  })

  if (error) throw new Error(`Failed to log event: ${error.message}`)
}

/**
 * Returns the most recent undoable (non-informational, not-yet-undone) events
 * for the game, newest first.
 */
export async function getUndoableEvents(
  db: SupabaseClient,
  game_id: string,
  limit = 10
): Promise<Record<string, unknown>[]> {
  const informationalList = Array.from(INFORMATIONAL_EVENTS)

  const { data, error } = await db
    .from('game_events')
    .select('*')
    .eq('game_id', game_id)
    .is('undone_at', null)
    .not('event_type', 'in', `(${informationalList.map((e) => `"${e}"`).join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch undoable events: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

/**
 * Marks an event as undone and inserts a corresponding undo record.
 */
export async function applyUndo(db: SupabaseClient, eventId: string): Promise<void> {
  // Stamp undone_at on the original event
  const { error: stampError } = await db
    .from('game_events')
    .update({ undone_at: new Date().toISOString() })
    .eq('id', eventId)

  if (stampError) throw new Error(`Failed to stamp undo: ${stampError.message}`)

  // Fetch the original event to copy its fields into the undo row
  const { data: original, error: fetchError } = await db
    .from('game_events')
    .select('game_id, player_id, round, phase')
    .eq('id', eventId)
    .single()

  if (fetchError || !original) throw new Error(`Failed to fetch original event for undo`)

  const { error: insertError } = await db.from('game_events').insert({
    game_id: original.game_id,
    player_id: original.player_id,
    event_type: EVT_UNDO,
    payload: { undo_of: eventId },
    round: original.round,
    phase: original.phase,
    undo_of: eventId,
  })

  if (insertError) throw new Error(`Failed to insert undo event: ${insertError.message}`)
}
