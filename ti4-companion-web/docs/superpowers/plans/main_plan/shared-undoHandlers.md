# shared-undoHandlers

**File:** `supabase/functions/_shared/undoHandlers.ts`
**Status:** New
**Prereqs:** shared-gameEvents

## Functionality

```pseudocode
// Registry: event_type → reversal function
type UndoHandler = (db, payload: Record<string, unknown>) => Promise<void>

const handlers: Map<string, UndoHandler> = {

  [EVT_SCORE_OBJECTIVE]: async (db, payload) =>
    UPDATE game_players SET vp = payload.vp_before WHERE id = payload.player_id
    UPDATE game_player_objectives SET scored = false WHERE player_id = payload.player_id AND objective_id = payload.objective_id

  [EVT_SCORE_SECRET]: async (db, payload) =>
    UPDATE game_players SET vp = payload.vp_before WHERE id = payload.player_id
    UPDATE game_player_secret_objectives SET scored = false WHERE player_id = payload.player_id AND objective_id = payload.objective_id

  [EVT_RESEARCH_TECH]: async (db, payload) =>
    UPDATE game_players SET technologies = payload.technologies_before WHERE id = payload.player_id

  [EVT_ASSIGN_HITS]: async (db, payload) =>
    restore game_player_units rows to payload.units_before (upsert each unit row)

  [EVT_DECLARE_RETREAT]: async (db, payload) =>
    UPDATE game_combats SET phase = 'attacker_roll', retreat_system_key = null WHERE id = payload.combat_id

  [EVT_ACTIVATE_SYSTEM]: async (db, payload) =>
    DELETE FROM game_system_activations WHERE game_id = payload.game_id AND system_key = payload.system_key AND player_id = payload.player_id

  [EVT_UPDATE_COMMAND_TOKENS]: async (db, payload) =>
    UPDATE game_players SET command_tokens = payload.tokens_before WHERE id = payload.player_id

  [EVT_LAND_TROOPS]: async (db, payload) =>
    restore game_player_units to payload.units_before

  [EVT_ADVANCE_PHASE]: async (db, payload) =>
    UPDATE games SET phase = payload.phase_before, round = payload.round WHERE id = payload.game_id

  [EVT_END_TURN]: async (db, payload) =>
    UPDATE games SET active_player_id = payload.player_id WHERE id = payload.game_id

  [EVT_PLAYER_PASS]: async (db, payload) =>
    UPDATE game_players SET passed = false WHERE id = payload.player_id
    UPDATE games SET active_player_id = payload.player_id WHERE id = payload.game_id

  // EVT_CAST_VOTES, EVT_RESOLVE_AGENDA, EVT_CREATE_TRANSACTION, EVT_CONFIRM_TRANSACTION,
  // EVT_DRAW_ACTION_CARD, EVT_DISCARD_ACTION_CARD, EVT_PLAY_PROMISSORY_NOTE,
  // EVT_RESOLVE_ABILITY, EVT_REVEAL_OBJECTIVE, EVT_DRAW_AGENDA:
  //   each restores the relevant before-snapshot from payload
}

export async function applyUndoHandler(db, event): Promise<void>
  handler = handlers.get(event.event_type)
  ERR('No undo handler for event type', 409) if !handler
  await handler(db, event.payload)
```

## Tests

```pseudocode
applyUndoHandler EVT_SCORE_OBJECTIVE: restores vp and un-marks objective
applyUndoHandler EVT_RESEARCH_TECH: restores technologies array
applyUndoHandler EVT_ASSIGN_HITS: restores unit rows to before snapshot
applyUndoHandler EVT_END_TURN: resets active_player_id
applyUndoHandler unknown type: ERR 409
```
