# fn-event-logging-all

**File:** `supabase/functions/*/index.ts` (all existing edge functions)
**Status:** Modify
**Prereqs:** shared-gameEvents

## Functionality

Uniform modification: every edge function adds one `await logEvent(...)` call immediately before its success response. No other logic changes.

Pattern per function:
```pseudocode
// at end of handler, before OK(result):
await logEvent(db, {
  game_id,
  player_id: player?.id ?? null,
  event_type: EVT_<FUNCTION>,
  payload: { /* before/after snapshots and inputs — see payload table */ },
  round: game.round,
  phase: game.phase,
})
OK(result)
```

Functions and their event types + key payload fields:

| Edge Function | EVT_ constant | Key payload fields |
|---|---|---|
| `game-end-turn` | `EVT_END_TURN` | `player_id, next_player_id` |
| `game-player-pass` | `EVT_PLAYER_PASS` | `player_id` |
| `game-advance-phase` | `EVT_ADVANCE_PHASE` | `phase_before, phase_after, round` |
| `game-score-objective` | `EVT_SCORE_OBJECTIVE` | `player_id, objective_id, vp_before, vp_after` |
| `game-score-secret-objective` | `EVT_SCORE_SECRET` | `player_id, objective_id, vp_before, vp_after` |
| `game-research-technology` | `EVT_RESEARCH_TECH` | `player_id, technology_id, technologies_before` |
| `game-draw-action-card` | `EVT_DRAW_ACTION_CARD` | `player_id, card_id` |
| `game-discard-action-card` | `EVT_DISCARD_ACTION_CARD` | `player_id, card_id` |
| `game-resolve-ability` | `EVT_RESOLVE_ABILITY` | `player_id, ability_key, targets` |
| `game-cast-votes` | `EVT_CAST_VOTES` | `player_id, agenda_id, votes, outcome` |
| `game-resolve-agenda` | `EVT_RESOLVE_AGENDA` | `agenda_id, outcome, effects_before` |
| `game-create-transaction` | `EVT_CREATE_TRANSACTION` | `from_player_id, to_player_id, offer` |
| `game-confirm-transaction` | `EVT_CONFIRM_TRANSACTION` | `transaction_id, from_player_id, to_player_id` |
| `game-activate-system` | `EVT_ACTIVATE_SYSTEM` | `player_id, system_key` |
| `game-land-troops` | `EVT_LAND_TROOPS` | `player_id, system_key, planet_name, units` |
| `game-fire-space-cannon` | `EVT_FIRE_SPACE_CANNON` | `player_id, system_key, dice_results, hits` |
| `game-roll-combat-dice` | `EVT_ROLL_COMBAT_DICE` | `player_id, combat_id, dice_results, hits` |
| `game-roll-ground-combat-dice` | `EVT_ROLL_GROUND_COMBAT_DICE` | `player_id, combat_id, dice_results, hits` |
| `game-assign-hits` | `EVT_ASSIGN_HITS` | `player_id, combat_id, casualties, units_before` |
| `game-declare-retreat` | `EVT_DECLARE_RETREAT` | `player_id, combat_id, retreat_to` |
| `game-update-command-tokens` | `EVT_UPDATE_COMMAND_TOKENS` | `player_id, tokens_before, tokens_after` |
| `game-reveal-objective` | `EVT_REVEAL_OBJECTIVE` | `objective_id` |
| `game-draw-agenda` | `EVT_DRAW_AGENDA` | `agenda_id` |
| `game-play-promissory-note` | `EVT_PLAY_PROMISSORY_NOTE` | `player_id, note_id, target_player_id` |

Dice-roll events (`EVT_ROLL_COMBAT_DICE`, `EVT_ROLL_GROUND_COMBAT_DICE`) are informational — they carry no reversible state. Undo skips them automatically via `INFORMATIONAL_EVENTS` set in `shared-gameEvents`.

## Tests

```pseudocode
For each modified function: existing tests unchanged.
Add one integration-style check: logEvent is called with correct event_type on success.
Skip logEvent check for 4xx/5xx paths (no event written on error).
```
