# Phase 8 — Promissory Notes + Trade Design

**Date:** 2026-04-19
**Status:** Approved

---

## Overview

Phase 8 adds the economy and diplomacy layer: promissory notes are dealt at game start, transferred between players via a mutual-confirmation trade system, and played into the play area. Trades are logged persistently and visible to all players.

---

## Decisions Made

| # | Question | Decision |
|---|---|---|
| 1 | Transaction confirmation model | DB-driven mutual confirmation (pending → confirmed/rejected/rescinded) |
| 2 | "Support for the Throne" VP | Auto VP adjustment on transfer when `into_play_area = true` on the note |
| 3 | "Play" action for hand notes | State-only (held → played/discarded); automated effect resolution deferred (see POTENTIAL_TODOS) |
| 4 | Generic notes at game start | Dealt to all players; `{{owner}}` placeholder in text resolved client-side at display time |
| 5 | Trade flow | All note movements go through the transaction system; no standalone direct-transfer endpoint |
| 6 | Commodities in trade | Auto-convert to trade goods for the recipient on confirmation |
| 7 | Transaction log placement | Modal opened from GameHeader ("TRADE LOG" button), visible to all players |
| 8 | Rescind offer | Proposer can rescind any pending transaction at any time |
| 9 | Active player constraint | Required only for `game-confirm-transaction`; create/reject/rescind have no timing restriction |
| 10 | Note limit per trade | Max 1 promissory note per side per transaction |
| 11 | Action phase trade limit | One confirmed transaction per player pair per active player's turn (enforced at confirmation) |
| 12 | Agenda phase trade limit | One confirmed transaction per player pair per agenda vote, tracked via `vote_sequence_at_creation` |

---

## Database Schema

One migration. No new tables.

```sql
-- Phase 8: Promissory Notes + Trade
ALTER TABLE public.game_transactions
  ADD COLUMN status                   TEXT        NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at             TIMESTAMPTZ,
  ADD COLUMN active_player_id         UUID        REFERENCES public.game_players(id),
  ADD COLUMN vote_sequence_at_creation INT;
```

### Column semantics

| Column | When set | Purpose |
|---|---|---|
| `status` | Always | `pending` / `confirmed` / `rejected` / `rescinded` |
| `confirmed_at` | On confirmation | Timestamp of trade execution |
| `active_player_id` | On confirmation | Active player at confirm time; used for action-phase per-turn enforcement |
| `vote_sequence_at_creation` | On creation | Snapshot of `games.current_vote_sequence`; used for agenda-phase per-vote enforcement |

### `items` JSONB structure

The existing `items` column is written with this structure:

```json
{
  "offer":   { "commodities": 2, "trade_goods": 0, "note_ids": ["<uuid>"] },
  "request": { "commodities": 0, "trade_goods": 1, "note_ids": [] }
}
```

`offer` = what `from_player_id` sends. `request` = what `from_player_id` asks for in return. Both `note_ids` arrays must have length ≤ 1.

### Existing tables used (no changes)

- `game_player_promissory_notes` — `state` (held/played/discarded), `held_by_player_id`, `origin_player_id`, `note_id`
- `promissory_notes` — `faction` (null = generic), `text` (may contain `{{owner}}`), `purge_on_use`, `into_play_area`
- `game_players` — `commodities`, `trade_goods`, `vp`

---

## Edge Functions

### Patch `game-start`

**What changes:** After dealing secret objectives, deal promissory notes to each player.

**Faction notes** (`promissory_notes.faction IS NOT NULL`): batch-query all notes whose `faction` matches a player's faction. Deal each player the notes belonging to their faction.

**Generic notes** (`promissory_notes.faction IS NULL`): deal one copy to every player. `origin_player_id` is set to the receiving player (drives `{{owner}}` display).

For each dealt note, insert a row into `game_player_promissory_notes`:
- `state = 'held'`
- `held_by_player_id = player.id`
- `origin_player_id = player.id`
- `note_id = <promissory_notes.id>`

Filtered by active expansions. Uses batch queries (not N+1 per player).

---

### `game-create-transaction`

**Body:** `{ game_id, to_player_id, offer: { commodities, trade_goods, note_ids }, request: { commodities, trade_goods, note_ids } }`

**Validates:**
- Caller is a player in the game
- `to_player_id` ≠ caller
- `offer.note_ids.length <= 1` and `request.note_ids.length <= 1`
- Caller has sufficient `commodities` and `trade_goods` for offer
- All `offer.note_ids` are held by caller (`state = 'held'`, `held_by_player_id = caller`)
- **Agenda phase only:** no confirmed transaction exists between this pair where `vote_sequence_at_creation = games.current_vote_sequence`

**Writes:** one `game_transactions` row with `status = 'pending'`, `vote_sequence_at_creation = games.current_vote_sequence`.

---

### `game-confirm-transaction`

**Body:** `{ game_id, transaction_id }`

**Validates:**
- Caller is `to_player_id`
- Transaction `status = 'pending'`
- One of `from_player_id` / `to_player_id` is the current active player (`games.active_player_id`)
- **Action phase only:** no confirmed transaction exists between this pair where `active_player_id = games.active_player_id`
- `to_player_id` still has sufficient items for their side of the request

**Executes atomically:**
1. Sender's `commodities` − `offer.commodities`; recipient's `trade_goods` + `offer.commodities` (auto-convert)
2. Sender's `trade_goods` − `offer.trade_goods`; recipient's `trade_goods` + `offer.trade_goods`
3. Mirror steps 1–2 for the request side (recipient sends to proposer)
4. For each note in `offer.note_ids` and `request.note_ids`:
   - Update `held_by_player_id` to the new holder
   - If `into_play_area = true`: set `state = 'played'`; +1 VP to new holder; −1 VP to previous holder if their row was `state = 'played'`
   - If `into_play_area = false`: `state` remains `'held'`
5. Set `status = 'confirmed'`, `confirmed_at = now()`, `active_player_id = games.active_player_id`

---

### `game-reject-transaction`

**Body:** `{ game_id, transaction_id }`

**Validates:** caller is `to_player_id`; `status = 'pending'`.

**Executes:** sets `status = 'rejected'`. No item changes.

---

### `game-rescind-transaction`

**Body:** `{ game_id, transaction_id }`

**Validates:** caller is `from_player_id`; `status = 'pending'`.

**Executes:** sets `status = 'rescinded'`. No item changes.

---

### `game-play-promissory-note`

**Body:** `{ game_id, note_instance_id }`

**Validates:** caller is `held_by_player_id` on the `game_player_promissory_notes` row; `state = 'held'`.

**Executes:**
- If `purge_on_use = true` on the reference note → `state = 'discarded'`
- Otherwise → `state = 'played'`

No automated effect resolution. See POTENTIAL_TODOS for deferred automation.

---

## UI Components

### New: `PromissoryNotesModal`

Private per-player view. Opened from `MyPanelSection` via "PROMISSORY NOTES (N)" button. Mirrors the `SecretObjectivesModal` pattern.

- Lists all held notes with name and effect text
- `{{owner}}` in effect text resolved client-side: replace with the `origin_player_id`'s `display_name` (available via join on load)
- **GIVE** button on every note — opens `TradeModal` with the note pre-filled in the offer side
- **PLAY** button — shown only for notes where `into_play_area = false`; calls `game-play-promissory-note`

---

### New: `TradeModal`

Opened from `MyPanelSection` ("TRADE" button) or pre-populated from `PromissoryNotesModal` (GIVE flow).

Two-panel layout:

**You send:**
- Commodity stepper (min 0, max `player.commodities`)
- Trade goods stepper (min 0, max `player.trade_goods`)
- Optional note picker from caller's held notes (max 1 selection)

**You receive:**
- Commodity request stepper
- Trade goods stepper
- Optional note picker from the target player's held notes (max 1 selection; note names visible to both parties during negotiation)

**Recipient selector:** dropdown of all other players in the game.

On submit: calls `game-create-transaction`. Closes on success.

One-sided trades (e.g. gifting a note with empty receive side) are valid — the "request" side can be all zeros/empty.

---

### New: `TradeOfferBanner`

Persistent banner displayed below `AbilityNotificationBar` when `pendingIncomingTrades` is non-empty.

Per pending offer: proposer name, one-line summary (e.g. "Offers 2 commodities for your Trade Convoy"). Buttons:
- **VIEW** — opens a read-only detail view of the offer
- **ACCEPT** — calls `game-confirm-transaction`
- **DECLINE** — calls `game-reject-transaction`

Multiple pending offers stack vertically.

---

### New: `TransactionLogModal`

Opened via "TRADE LOG" button in `GameHeader`. Visible to all players.

Lists all `confirmed` transactions in reverse chronological order. Each row: round, phase, player names (from → to), items exchanged on each side. Read-only.

---

### Extended: `MyPanelSection`

New buttons added alongside ACTION CARDS / SECRETS:
- `PROMISSORY NOTES (N)` — N = count of `held` notes for current player
- `TRADE`

New props: `onOpenNotes`, `noteCount`, `onOpenTrade`.

---

### Extended: `GameScreen`

New modal state: `notesModalOpen`, `tradeModalOpen`.

New data from `useGame`:
- `myNotes` — current player's `held` notes with joined `promissory_notes` ref data and `origin_player_id` display name
- `pendingIncomingTrades` — `game_transactions` rows where `to_player_id = currentPlayer.id` and `status = 'pending'`

New Realtime subscriptions in `useGame`:
- `game_player_promissory_notes` — game-scoped; refreshes `myNotes` on INSERT/UPDATE
- `game_transactions` — game-scoped; refreshes `pendingIncomingTrades` on INSERT/UPDATE

New `useGame` wrappers: `createTransaction`, `confirmTransaction`, `rejectTransaction`, `rescindTransaction`, `playNote`.

"TRADE LOG" button added to `GameHeader`.

---

## Testing

### Edge Function tests (mocked db, one file per function)

**`game-start` patch:**
- Deals faction notes to matching players only
- Deals generic notes to all players
- Skips notes outside active expansions
- Does not create duplicate rows if called twice (idempotent guard or error)

**`game-create-transaction`:**
- Rejects if caller not in game
- Rejects if `to_player_id = from_player_id`
- Rejects if more than 1 note per side
- Rejects if insufficient commodities or trade_goods
- Rejects if note not owned by caller or not `held`
- Agenda phase: rejects if confirmed transaction exists at current `vote_sequence`
- Records `vote_sequence_at_creation` on every new row
- Writes `status = 'pending'`

**`game-confirm-transaction`:**
- Rejects if caller is not `to_player_id`
- Rejects if `status ≠ 'pending'`
- Rejects if neither party is active
- Action phase: rejects duplicate confirmed trade on same active player's turn
- Rejects if `to_player_id` has insufficient items
- Commodities auto-convert to trade_goods for recipient
- Note `held_by_player_id` updated correctly
- `into_play_area = true` note: `state = 'played'`, VP adjusted for both sides
- `into_play_area = false` note: `state` remains `'held'`
- Sets `confirmed_at`, `active_player_id`, `status = 'confirmed'`

**`game-reject-transaction`:**
- Rejects if caller is not `to_player_id`
- Sets `status = 'rejected'`; no item changes

**`game-rescind-transaction`:**
- Rejects if caller is not `from_player_id`
- Rejects if `status ≠ 'pending'`
- Sets `status = 'rescinded'`; no item changes

**`game-play-promissory-note`:**
- Rejects if caller does not hold the note
- `purge_on_use = true` → `state = 'discarded'`
- `purge_on_use = false` → `state = 'played'`
- No VP change

### Component tests (React Testing Library)

**`PromissoryNotesModal`:** renders held notes with name and effect text; `{{owner}}` resolved to origin player display name; GIVE button present; PLAY button absent for `into_play_area = true` notes; PLAY calls handler.

**`TradeModal`:** commodity stepper capped at player's commodities; note picker limited to 1 per side; submit disabled with no recipient selected; calls `onSubmit` with correct payload; empty receive side accepted (gift flow).

**`TradeOfferBanner`:** renders for each pending incoming trade; ACCEPT calls confirm handler; DECLINE calls reject handler; hidden when `pendingIncomingTrades` is empty.

**`TransactionLogModal`:** renders confirmed transactions; skips pending/rejected/rescinded rows; displays round, phase, player names, items.

**`MyPanelSection`:** renders PROMISSORY NOTES button with correct count; renders TRADE button; both call correct handlers.

**`GameScreen`:** wires `myNotes` and `pendingIncomingTrades` from `useGame`; opens correct modals on button press.

### `useGame` hook tests

- `myNotes` populated from `game_player_promissory_notes` join on load; updates on Realtime INSERT/UPDATE
- `pendingIncomingTrades` filters to `status = 'pending'` and `to_player_id = currentPlayer.id`; updates when a transaction is confirmed/rejected/rescinded

---

## Out of Scope (Phase 8)

- Automated note effect resolution (POTENTIAL_TODOS — HIGH PRIORITY)
- Agenda phase per-vote constraint requires `games.current_vote_sequence` from Phase 7; Phase 8 reads this column but never writes it
- Generic note types beyond what is already imported into the `promissory_notes` reference table
