# Bot Players & Game Event Log — Design

**Date:** 2026-04-29
**Features:** Computer (bot) players with legal play; append-only game event log with host undo

---

## Overview

Two related features:

1. **Bot players** — Lobby-configured computer players driven by the host client. Legal play only; two selectable strategies (`scripted` or `random`). Useful for solo testing of game flow.
2. **Game event log** — Every edge function appends an event to `game_events`. Supports: human-readable game history, host undo (one step per click, unlimited depth), and future analytics / AI training.

The event log is a prerequisite for undo; both features ship together.

---

## 1. Schema

### Migration A — Bot player support (`game_players`)

- `user_id` — changed from `NOT NULL` to nullable. Bots have no auth account.
- `is_bot BOOLEAN NOT NULL DEFAULT FALSE`
- `bot_strategy TEXT CHECK (bot_strategy IN ('random', 'scripted'))` — nullable; only set when `is_bot = true`

### Migration B — Event log enhancements (`game_events`)

Existing columns: `id, game_id, player_id, event_type, payload, round, phase, created_at`

New columns:
- `undone_at TIMESTAMPTZ` — null = active; non-null = undone at that timestamp
- `undo_of UUID REFERENCES game_events(id)` — reversal events reference the event they reverse

The log is **append-only**. An undo produces two rows: the original (with `undone_at` stamped) and a new reversal row (with `undo_of` set). Active-event queries filter `WHERE undone_at IS NULL`.

---

## 2. Event Payloads

Each event stores enough to display history and reverse the action. General rule: capture inputs, dice results, and `_before`/`_after` snapshots for any mutated fields. The `_before` snapshot is what undo restores.

Examples:

| Event type | Payload fields |
|---|---|
| `EVT_END_TURN` | `player_id, next_player_id` |
| `EVT_SCORE_OBJECTIVE` | `player_id, objective_id, vp_before, vp_after` |
| `EVT_ROLL_COMBAT_DICE` | `player_id, system_coord, unit_type, dice_results[], hits` |
| `EVT_ASSIGN_HITS` | `player_id, system_coord, units_destroyed[], units_before, units_after` |
| `EVT_RESEARCH_TECHNOLOGY` | `player_id, technology_id, technologies_before[], technologies_after[]` |

Dice-roll events are informational only — they carry no state to reverse, so undo skips them and moves to the next state-change event.

Event type constants are defined in `_shared/gameEvents.ts` (no magic strings in edge functions).

---

## 3. Shared Event Helper (`_shared/gameEvents.ts`)

Exports:

- `logEvent(db, { game_id, player_id, event_type, payload, round, phase })` — inserts one active event. Called at the end of every edge function before returning success.
- `getUndoableEvents(db, game_id, limit = 10)` — returns most recent active events, newest-first.
- `applyUndo(db, eventId)` — stamps `undone_at` on the original and inserts a reversal row with `undo_of`.

Every existing edge function (~25) gets a single `await logEvent(...)` call added. No other logic changes to existing functions.

---

## 4. Bot Players — Server Side

### Turn auth helper (`_shared/auth.ts`)

The existing inline turn check (`caller.id === game.active_player_id`) is extracted into `requireTurnAuth(game, callerPlayer, activePlayer)`. It permits:
- Caller is the active player (normal human turn), **or**
- Active player has `is_bot = true` AND caller is the host

### New edge functions

- `game-add-bot` — host only; takes `{ game_id, display_name, faction, color, bot_strategy }`; inserts a `game_players` row with `is_bot = true, user_id = null`.
- `game-remove-bot` — host only; removes a bot slot before game start.

`game-start` requires no changes — it already treats all `game_players` rows uniformly by `seat_index`.

---

## 5. Bot Players — Client Side (`src/hooks/useBotPlayer.js`)

Mounted inside `GameScreen`. Watches `game.active_player_id` via the existing Realtime subscription.

**Trigger:** Active player is a bot AND current user is host → wait 1 second → call `getNextAction(gameState, botPlayer)` → dispatch edge function → wait for Realtime update → repeat until bot's turn ends.

**Strategy modules** (`src/lib/botStrategies/`):

- `scripted.js` — deterministic per phase:
  - Strategy phase: lowest-numbered available strategy card
  - Action phase: activate home system → produce units if possible → pass
  - Combat: assign hits to infantry first; never retreat
  - Status/Agenda: pass immediately; vote "For" on all agendas

- `random.js` — same decision points, uniform random choice from legal options

Both export `getNextAction(gameState, botPlayer) → { fnName, args }`.

**UI:** A "Bot is thinking..." indicator appears in the active player slot during bot turns.

---

## 6. Undo (`game-undo` edge function)

Host only. Processes one step per call (host clicks Undo once per action).

**Flow:**
1. `getUndoableEvents(db, game_id, 1)` — fetch most recent active non-informational event
2. Look up reversal handler by `event_type` in `_shared/undoHandlers.ts`
3. Handler restores `_before` snapshot values to the relevant table rows
4. `applyUndo(db, eventId)` — stamp original, append reversal row
5. Return updated game state

**Reversal handlers** (`_shared/undoHandlers.ts`), one per event type. Examples:
- `EVT_SCORE_OBJECTIVE` → restore `game_players.vp` to `vp_before`; un-mark objective as scored
- `EVT_ASSIGN_HITS` → restore `game_player_units` rows to `units_before`
- `EVT_ROLL_COMBAT_DICE` → no-op (skipped automatically)

**UI:** Undo button in `GameHeader`, host-only, disabled when no undoable events exist. One click = one undo step.

---

## 7. Lobby UI Changes (`LobbyScreen.jsx`)

- Host sees an "Add Bot" button alongside the existing player slot list
- Bot slots show a robot icon, display name, faction/colour picker, and a strategy toggle (`Scripted` / `Random`)
- Host can remove a bot slot before starting

No changes to `GameScreen` beyond mounting `useBotPlayer` and adding the Undo button to `GameHeader`.

---

## 8. Phase Assignment

These features span two new phases:

| Phase | Label |
|---|---|
| 32 | Game Event Log (shared helper + event writes in all edge functions) |
| 33 | Bot Players + Undo |

Phase 32 must complete before Phase 33 (undo depends on the event log; bot actions must also be logged).
