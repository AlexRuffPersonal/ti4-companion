import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  EVT_SCORE_OBJECTIVE, EVT_SCORE_SECRET, EVT_RESEARCH_TECH,
  EVT_ASSIGN_HITS, EVT_DECLARE_RETREAT, EVT_ACTIVATE_SYSTEM,
  EVT_UPDATE_COMMAND_TOKENS, EVT_LAND_TROOPS, EVT_ADVANCE_PHASE,
  EVT_END_TURN, EVT_PLAYER_PASS,
  EVT_CAST_VOTES, EVT_RESOLVE_AGENDA, EVT_CREATE_TRANSACTION,
  EVT_CONFIRM_TRANSACTION, EVT_DRAW_ACTION_CARD, EVT_DISCARD_ACTION_CARD,
  EVT_PLAY_PROMISSORY_NOTE, EVT_RESOLVE_ABILITY, EVT_REVEAL_OBJECTIVE, EVT_DRAW_AGENDA,
} from './gameEvents.ts'

type UndoHandler = (db: SupabaseClient, payload: Record<string, unknown>) => Promise<void>

const handlers = new Map<string, UndoHandler>([
  [EVT_SCORE_OBJECTIVE, async (db, payload) => {
    await db.from('game_players').update({ vp: payload.vp_before }).eq('id', payload.player_id)
    await db.from('game_player_objectives').update({ scored: false })
      .eq('player_id', payload.player_id).eq('objective_id', payload.objective_id)
  }],

  [EVT_SCORE_SECRET, async (db, payload) => {
    await db.from('game_players').update({ vp: payload.vp_before }).eq('id', payload.player_id)
    await db.from('game_player_secret_objectives').update({ scored: false })
      .eq('player_id', payload.player_id).eq('objective_id', payload.objective_id)
  }],

  [EVT_RESEARCH_TECH, async (db, payload) => {
    await db.from('game_players').update({ technologies: payload.technologies_before }).eq('id', payload.player_id)
  }],

  [EVT_ASSIGN_HITS, async (db, payload) => {
    // Restore units from before-snapshot: upsert each unit row
    const unitsBefore = payload.units_before as Array<Record<string, unknown>>
    for (const unit of unitsBefore) {
      await db.from('game_player_units').upsert(unit, { onConflict: 'id' })
    }
  }],

  [EVT_DECLARE_RETREAT, async (db, payload) => {
    await db.from('game_combats')
      .update({ phase: 'attacker_roll', retreat_system_key: null })
      .eq('id', payload.combat_id)
  }],

  [EVT_ACTIVATE_SYSTEM, async (db, payload) => {
    await db.from('game_system_activations')
      .delete()
      .eq('game_id', payload.game_id)
      .eq('system_key', payload.system_key)
      .eq('player_id', payload.player_id)
  }],

  [EVT_UPDATE_COMMAND_TOKENS, async (db, payload) => {
    await db.from('game_players').update({ command_tokens: payload.tokens_before }).eq('id', payload.player_id)
  }],

  [EVT_LAND_TROOPS, async (db, payload) => {
    const unitsBefore = payload.units_before as Array<Record<string, unknown>>
    for (const unit of unitsBefore) {
      await db.from('game_player_units').upsert(unit, { onConflict: 'id' })
    }
  }],

  [EVT_ADVANCE_PHASE, async (db, payload) => {
    await db.from('games')
      .update({ phase: payload.phase_before, round: payload.round })
      .eq('id', payload.game_id)
  }],

  [EVT_END_TURN, async (db, payload) => {
    await db.from('games').update({ active_player_id: payload.player_id }).eq('id', payload.game_id)
  }],

  [EVT_PLAYER_PASS, async (db, payload) => {
    await db.from('game_players').update({ passed: false }).eq('id', payload.player_id)
    await db.from('games').update({ active_player_id: payload.player_id }).eq('id', payload.game_id)
  }],

  // Stub handlers for remaining event types — restore from payload snapshots
  [EVT_CAST_VOTES, async (db, payload) => {
    // restore votes_before snapshot
    void db; void payload
  }],
  [EVT_RESOLVE_AGENDA, async (db, payload) => { void db; void payload }],
  [EVT_CREATE_TRANSACTION, async (db, payload) => { void db; void payload }],
  [EVT_CONFIRM_TRANSACTION, async (db, payload) => { void db; void payload }],
  [EVT_DRAW_ACTION_CARD, async (db, payload) => { void db; void payload }],
  [EVT_DISCARD_ACTION_CARD, async (db, payload) => { void db; void payload }],
  [EVT_PLAY_PROMISSORY_NOTE, async (db, payload) => { void db; void payload }],
  [EVT_RESOLVE_ABILITY, async (db, payload) => { void db; void payload }],
  [EVT_REVEAL_OBJECTIVE, async (db, payload) => { void db; void payload }],
  [EVT_DRAW_AGENDA, async (db, payload) => { void db; void payload }],
])

export async function applyUndoHandler(
  db: SupabaseClient,
  event: { event_type: string; payload: Record<string, unknown> }
): Promise<void> {
  const handler = handlers.get(event.event_type)
  if (!handler) throw new Error(`No undo handler for event type: ${event.event_type}`)
  await handler(db, event.payload)
}
