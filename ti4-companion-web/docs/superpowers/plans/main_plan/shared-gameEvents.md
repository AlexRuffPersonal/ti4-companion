# shared-gameEvents

**File:** `supabase/functions/_shared/gameEvents.ts`
**Status:** New
**Prereqs:** migration-045-event-log

## Functionality

```pseudocode
// Event type constants (no magic strings in edge functions)
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
export const EVT_ROLL_COMBAT_DICE = 'roll_combat_dice'        // informational
export const EVT_ROLL_GROUND_COMBAT_DICE = 'roll_ground_combat_dice'  // informational
export const EVT_ASSIGN_HITS = 'assign_hits'
export const EVT_DECLARE_RETREAT = 'declare_retreat'
export const EVT_UPDATE_COMMAND_TOKENS = 'update_command_tokens'
export const EVT_REVEAL_OBJECTIVE = 'reveal_objective'
export const EVT_DRAW_AGENDA = 'draw_agenda'
export const EVT_PLAY_PROMISSORY_NOTE = 'play_promissory_note'
export const EVT_UNDO = 'undo'

// Informational events — carry no reversible state; undo skips these
export const INFORMATIONAL_EVENTS = new Set([EVT_ROLL_COMBAT_DICE, EVT_ROLL_GROUND_COMBAT_DICE])

export interface LogEventParams {
  game_id: string
  player_id?: string | null
  event_type: string
  payload: Record<string, unknown>
  round: number
  phase: string
}

export async function logEvent(db, params: LogEventParams): Promise<void>
  INSERT INTO game_events (game_id, player_id, event_type, payload, round, phase)
  VALUES (params.game_id, params.player_id, params.event_type, params.payload, params.round, params.phase)

export async function getUndoableEvents(db, game_id: string, limit: number = 10)
  SELECT * FROM game_events
  WHERE game_id = game_id
    AND undone_at IS NULL
    AND event_type NOT IN INFORMATIONAL_EVENTS
  ORDER BY created_at DESC
  LIMIT limit

export async function applyUndo(db, eventId: string): Promise<void>
  now = new Date().toISOString()
  UPDATE game_events SET undone_at = now WHERE id = eventId
  INSERT INTO game_events (game_id, player_id, event_type, payload, round, phase, undo_of)
    SELECT game_id, player_id, EVT_UNDO, jsonb_build_object('undo_of', id), round, phase, id
    FROM game_events WHERE id = eventId
```

## Tests

```pseudocode
logEvent: inserts row with correct fields; undone_at and undo_of are null
getUndoableEvents: excludes informational events; excludes undone events; orders newest-first; respects limit
applyUndo: stamps undone_at on original; inserts reversal row with undo_of set
```
