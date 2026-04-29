# Phase 29: Action Card Effect Enforcement Design

**Date:** 2026-04-29
**Status:** Approved

---

## Overview

Implements full server-side enforcement for all non-combat action cards (~79 cards; the 14 combat-timing cards were handled in Phase 20). Delivered in two sub-phases:

- **Phase 29a** — Foundation: `ability` JSONB on `action_cards`, ~10 new DSL ops, `game-play-action-card` Edge Function for `Action:` timing cards, admin import update, UI Play button.
- **Phase 29b** — Reactive windows: `pending_action_window` on `games`, window lifecycle, trigger wiring in existing Edge Functions, enforcement of `When`/`After`/agenda/status-phase timing cards.

**Rules basis:** LRR §2.6 (timing header governs when a card can be played), §2.6a (Action: cards require a component action; cannot be played if effect cannot fully resolve), §2.6b (same-name cards cannot be played in the same window), §2.7 (card discarded after play), §2.8 (canceled cards have no effect).

---

## Phase 29a — Foundation & Action-Timing Cards

### Database — Migration 041

```sql
-- DSL storage on action cards reference table
ALTER TABLE action_cards
  ADD COLUMN ability JSONB;
-- null = effect not yet authored; array of DSL ops when authored

-- Ephemeral state columns needed by specific card effects

-- Signal Jam / Solar Flare: cleared at round end by game-advance-phase
ALTER TABLE games
  ADD COLUMN movement_blocked_systems TEXT[] NOT NULL DEFAULT '{}';

-- Blitz: +N production capacity, consumed when game-produce-units runs
ALTER TABLE game_players
  ADD COLUMN production_bonus INT NOT NULL DEFAULT 0;

-- Ghost Ship: checked by game-move-ships (Phase 18); set when placed
ALTER TABLE game_player_units
  ADD COLUMN no_move_this_round BOOLEAN NOT NULL DEFAULT false;
```

`movement_blocked_systems` is reset to `'{}'` by `game-advance-phase` at the start of each new round. `no_move_this_round` is reset to `false` on all units by `game-advance-phase` at the start of each new round.

---

### New DSL Ops — abilityDsl.ts

Each op receives `(db, gameId, playerId, op, selections, context)`.

| Op | Required selections | Effect |
|---|---|---|
| `exhaust_planet` | `planet_name` | Exhaust planet owned by player; `ERR 409` if not owned |
| `destroy_units_on_planet` | `planet_name` | Destroy up to `op.count` units of `op.unit_type` on planet; `ERR 409` if fewer than count present (unless `op.up_to=true`) |
| `roll_and_destroy_units` | `planet_name`, `target_player_id` | Roll 1d10 per unit of `op.unit_type` on planet for `target_player_id`; destroy unit if roll ≤ `op.threshold` |
| `steal_action_card` | `target_player_id` | Take 1 random held card from target player; update `held_by_player_id`; adjust both players' `action_card_count` |
| `look_at_hand` | `target_player_id` | Return target player's held card IDs/names to caller in response; no DB write |
| `modify_next_production` | — | `game_players.production_bonus += op.amount` for activating player |
| `block_system_movement` | `system_key` | Append to `games.movement_blocked_systems` |
| `place_unit_no_move` | `system_key` | `place_units` logic (upsert `game_player_units`) + set `no_move_this_round=true` on the inserted row |
| `remove_tokens_from_board` | `target_player_id` | Delete all `game_system_activations` rows where `player_id=target_player_id AND round=game.round` |
| `swap_strategy_cards` | `target_player_id` | Swap `strategy_card_id` values in `game_strategy_card_assignments` between activating player and target |

---

### Edge Function — `game-play-action-card` (Phase 29a)

**File:** `supabase/functions/game-play-action-card/index.ts`

```pseudocode
CORS
AUTH
BODY(game_id, card_id)
PLAYER
GAME(phase, active_player_id, round)

ERR 409 'Not the action phase' if game.phase !== 'action'
ERR 409 'Not your turn' if game.active_player_id !== player.id

fetch game_action_card_deck JOIN action_cards
  WHERE deck.id=card_id AND deck.held_by_player_id=player.id AND deck.state='hand'
ERR 404 if not found

ERR 409 'Card timing is not Action:' if card.timing !== 'Action:'
ERR 409 'Card effect not implemented' if card.ability is null

resolveAbility(db, gameId, player.id, card.ability, body.selections ?? {})

UPDATE game_action_card_deck SET state='discard', held_by_player_id=null WHERE id=card_id
UPDATE game_players SET action_card_count -= 1 WHERE id=player.id

// End the player's action turn (same shared logic as game-end-turn):
// mark game_players.passed = true for this player
// select next active_player_id as min-initiative player where passed=false; if all passed, set active_player_id=null
UPDATE game_players SET passed = true WHERE id=player.id
next = select player with min initiative_order WHERE game_id=gameId AND passed=false
UPDATE games SET active_player_id = next?.id ?? null

OK({ discarded: card_id })
```

---

### Admin Import — `importSchemas.js`

Add `ability` field to the `action-cards` entry:
```js
{ name: 'ability', type: 'jsonb', required: false,
  description: 'DSL op array for server-enforced effect. null = not yet authored.' }
```

Redeploy `admin-import-action-cards` function (no schema change to the Edge Function itself — the import already stores all provided fields).

---

### Client & UI

**`edgeFunctions.js`** — add:
```js
export const playActionCard = (gameId, cardId, selections) =>
  callFunction('game-play-action-card', { game_id: gameId, card_id: cardId, selections })
```

**`useGame.js`** (or `useActionCards.js`) — add dispatcher:
```js
playActionCard: (cardId, selections) => playActionCard(gameId, cardId, selections)
```

**`ActionCardModal.jsx`** — add Play button per card. Cards with `ability !== null` and `timing === 'Action:'` show an active Play button. Clicking opens a `SelectionsModal` (inline form within the modal) for any required `selections` fields, then calls `playActionCard`. Cards without ability show a disabled "Not yet enforced" label.

---

## Phase 29b — Reactive Window Mechanism

### Database — Migration 042

```sql
ALTER TABLE games
  ADD COLUMN pending_action_window JSONB;
```

Column shape:
```json
{
  "type": "when_agenda_revealed",
  "eligible_player_ids": ["uuid", "..."],
  "passed_player_ids": [],
  "context": {}
}
```

Window is null when no window is open. Cleared (set to null) when all eligible players are in `passed_player_ids` or have played a card.

---

### Window Types & Triggers

| Window type | Opened by | Eligible card timing | Cards |
|---|---|---|---|
| `when_agenda_revealed` | `game-draw-agenda` | `"When an agenda is revealed:"` | Veto |
| `after_speaker_votes` | `game-cast-votes` when speaker submits votes | `"After the speaker votes on an agenda:"` | Bribery |
| `when_voting_begins` | `game-advance-phase` (or equivalent) when agenda phase transitions into voting step | `"When voting begins:"` | Political Secret |
| `after_technology_researched` | `game-research-technology` | `"After a player researches a technology:"` | Plagiarize |

**Eligible players** = all `game_players` in the game whose `action_card_count > 0` and who hold at least one card with the matching timing header. Computed at window-open time from `game_action_card_deck JOIN action_cards`.

**Triggering function changes** (each): before returning `OK(...)`, check if any player holds a card for that window type; if yes, `UPDATE games SET pending_action_window = { type, eligible_player_ids, passed_player_ids: [], context }`.

---

### Edge Function — `game-pass-action-window` (extend Phase 20 function)

**File:** `supabase/functions/game-pass-action-window/index.ts`

Phase 20 uses this function to pass on combat-level windows (`game_combats.window_passes`). Phase 29b extends it to also handle game-level windows (`games.pending_action_window`). Branch on presence of `combat_id` in the request body: if provided, use existing Phase 20 logic; if absent, use the game-level window logic below.

```pseudocode
CORS
AUTH
BODY(game_id)
PLAYER
GAME(pending_action_window)

ERR 409 'No active window' if game.pending_action_window is null
ERR 409 'Not eligible for this window' if player.id NOT IN window.eligible_player_ids

append player.id to window.passed_player_ids
if window.passed_player_ids.length === window.eligible_player_ids.length:
  UPDATE games SET pending_action_window = null
else:
  UPDATE games SET pending_action_window = updated window

OK({})
```

---

### `game-play-action-card` — Reactive Timing Extension (Phase 29b)

Add a branch before the existing `Action:` timing check:

```pseudocode
if card.timing !== 'Action:':
  window = game.pending_action_window
  ERR 409 'No active window for this card timing' if window is null
  ERR 409 'Card timing does not match open window' if card.timing !== TIMING_MAP[window.type]
  ERR 409 'Not eligible for this window' if player.id NOT IN window.eligible_player_ids

  resolveAbility(db, gameId, player.id, card.ability, body.selections ?? {}, { context: window.context })

  UPDATE game_action_card_deck SET state='discard', held_by_player_id=null
  UPDATE game_players SET action_card_count -= 1

  append player.id to window.passed_player_ids
  if all eligible passed or played: UPDATE games SET pending_action_window = null
  else: UPDATE games SET pending_action_window = updated window

  OK({ discarded: card_id })
  return

// existing Action: branch follows...
```

`TIMING_MAP`:
```js
const TIMING_MAP = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting begins:',
  after_technology_researched: 'After a player researches a technology:',
}
```

---

### New DSL Ops — Phase 29b

| Op | Effect |
|---|---|
| `replace_agenda` | Draw next card from agenda deck; update `games.agenda_current_card_id` to new card; discard previous (Veto) |
| `add_votes` | Cast `selections.vote_count` additional votes for `selections.outcome` on current agenda — delegates to `cast_votes` op logic with `context.agenda_id` |
| `research_same_technology` | Look up `context.technology_name` from window context; apply `gain_technology` op for activating player (Plagiarize) |

(`prevent_vote` already exists from Phase 19 — covers Political Secret.)

---

### UI — Window Prompt

When `game.pending_action_window` is non-null and the current player is in `eligible_player_ids` and not yet in `passed_player_ids`, show a dismissible banner/overlay:

> **Action card window open** — [window type description]  
> [Play a card] [Pass]

- **Play a card** — opens `ActionCardModal` filtered to cards matching the window timing
- **Pass** — calls `game-pass-action-window`

Non-eligible players see no prompt. Window prompt is sourced from the `games` Realtime subscription (already subscribed via `useGame`).

---

## Testing Notes

- Phase 29a: test each new DSL op in `tests/lib/abilityDsl.test.js`; test `game-play-action-card` for happy path, 409 wrong phase, 409 wrong turn, 404 card not in hand, 409 non-Action timing, 409 null ability
- Phase 29b: test window-open in each triggering function; test `game-pass-action-window` for happy path and all error paths; test `game-play-action-card` for each reactive timing in TIMING_MAP; test window auto-clear when all eligible pass
