# TI4 Companion — Phase 7: Agenda Phase Design

**Goal:** Implement the political layer of TI4 — two agendas resolved per agenda phase, with real-time voting in reverse speaker order, enacted law tracking, and hybrid structured resolution for tractable agenda types.

---

## Key Decisions

- **Agenda phase always visible** — no custodians gate; host controls when the phase begins via `HostControlsSection`. Host discipline determines timing. The custodians gate (agenda unlocks when a player claims Mecatol Rex) is deliberately deferred to Phase 9 when map and planet-claiming are implemented. At that point, `game-claim-custodians` should award 1 VP, set `games.agenda_unlocked = true`, and the "Begin Agenda Phase" button should be hidden until that flag is set.
- **One agenda at a time** — first agenda is fully resolved before the second is drawn. No simultaneous dual-agenda state.
- **Hybrid resolution** — tractable `elect_type` values (player, planet, law, VP adjust, tech grant, planet exhaust) get full structured resolution. Non-tractable types show a "host applies manually" banner with the effect text.
- **Server-enforced vote order** — `game-cast-votes` rejects out-of-turn votes. Order is reverse speaker (speaker votes last).
- **Full law automation (tractable only)** — laws with effects that map cleanly to existing DB state are automated. Non-tractable laws are display-only with a manual reminder.
- **Speaker manages agenda phase** — Draw Agenda and Resolve buttons are speaker-accessible, not host-only.

---

## Schema (Migration 025_phase7.sql)

### `games` table additions

| Column | Type | Default | Notes |
|---|---|---|---|
| `agenda_phase_step` | TEXT | `'inactive'` | CHECK: `inactive \| agenda_1_voting \| agenda_1_resolved \| agenda_2_voting \| done` |
| `agenda_current_card_id` | INT FK → `agendas` | NULL | Single card currently in play; null when no card drawn |
| `agenda_vote_current_player_id` | INT FK → `game_players` | NULL | Whose turn it is to vote; null when voting complete |
| `current_vote_sequence` | INT | `0` | Increments each time a new agenda card is drawn for voting. Used by `game-create-transaction` (Phase 8) to enforce the one-trade-per-agenda-vote rule — a player may only confirm one transaction per unique `current_vote_sequence` value. |

### New `game_agenda_deck` table

| Column | Type | Notes |
|---|---|---|
| `game_id` | UUID FK → `games` | |
| `agenda_id` | INT FK → `agendas` | |
| `position` | INT | Shuffle order |
| `state` | TEXT | CHECK: `deck \| voting \| enacted \| repealed \| discarded` |

`state` lifecycle:
- `deck` → `voting` when drawn by speaker
- `voting` → `enacted` if passed as a law
- `voting` → `discarded` if resolved as a directive or failed to pass
- `enacted` → `repealed` when a repeal agenda resolves against it

At most one row per game has `state = 'voting'` at any time.

### New `game_agenda_votes` table

| Column | Type | Notes |
|---|---|---|
| `game_id` | UUID FK → `games` | |
| `game_player_id` | INT FK → `game_players` | |
| `agenda_id` | INT FK → `agendas` | Which card this vote is for |
| `choice` | TEXT | The option voted for (null if abstained) |
| `vote_count` | INT | Number of votes cast (0 if abstained) |
| `abstained` | BOOL | Default false |

Unique constraint on `(game_id, game_player_id, agenda_id)`.

### New `game_laws` table

| Column | Type | Notes |
|---|---|---|
| `game_id` | UUID FK → `games` | |
| `agenda_id` | INT FK → `agendas` | |
| `round_enacted` | INT | Round when the law passed |
| `elected_target` | TEXT | Player ID, planet name, or free text depending on `elect_type` |
| `is_repealed` | BOOL | Default false |
| `host_applies_manually` | BOOL | Default false; true for non-tractable laws |

### `game-start` patch

Shuffle all agendas into `game_agenda_deck` with random `position` values (`state = 'deck'`). Filtered by active expansions (`base` / `pok` flag on `agendas`).

---

## Shared Helper: `_shared/player-order.ts`

Exports `getNextPlayer(gameId, currentPlayerId, order, db)`:

- **`order: 'initiative'`** — ascending strategy card number (action phase turn order)
- **`order: 'reverse_speaker'`** — reverse of speaker order (agenda phase voting; speaker votes last)

Always returns the next player ID in the sequence, **looping** from last back to first. Never returns null.

Callers detect full-cycle completion themselves:
- `game-cast-votes` — checks whether all players have a row in `game_agenda_votes` for the current `agenda_id` after advancing; if so, sets `agenda_vote_current_player_id = null`.
- Action phase (future) — looping behaviour is natural; turn order cycles continuously.

---

## Edge Functions

### Patch `game-start`
Shuffle agendas into `game_agenda_deck` with random `position` (state = `deck`). Filtered by expansions.

### `game-draw-agenda`
- **Auth:** Speaker only.
- **Validates:** Step is `agenda_1_voting` (no card drawn yet) or `agenda_1_resolved` (ready for second card); no card currently in play.
- **Effect:** Sets top `deck` card (lowest `position`) to `voting`; sets `games.agenda_current_card_id`; sets `agenda_vote_current_player_id` to the first voter in reverse speaker order (via `getNextPlayer`); increments `current_vote_sequence`. If step was `agenda_1_resolved`, advances it to `agenda_2_voting`.

### `game-cast-votes`
- **Auth:** Any player, but only when `agenda_vote_current_player_id` matches the caller.
- **Validates:** It is the caller's turn; `vote_count` does not exceed available influence (sum of non-exhausted planet influence for that player).
- **Effect:** Upserts row in `game_agenda_votes`. Advances `agenda_vote_current_player_id` via `getNextPlayer(..., 'reverse_speaker')`. If all players now have a vote row for the current `agenda_id`, sets `agenda_vote_current_player_id = null`.

### `game-resolve-agenda`
- **Auth:** Speaker only.
- **Input:** `agenda_id`, `elected_target` (player ID, planet name, or free text).
- **Effect by outcome type:**
  - **Tractable law** — applies state change automatically (VP adjust, planet exhaust, tech grant, etc.); inserts into `game_laws` (`host_applies_manually = false`); sets deck row to `enacted`.
  - **Directive** — applies effect if tractable; sets deck row to `discarded`.
  - **Non-tractable** — sets deck row to appropriate terminal state; inserts into `game_laws` (`host_applies_manually = true`); UI shows a manual-reminder banner.
  - **Repeal agenda** — sets target `game_laws.is_repealed = true`; sets target deck row to `repealed`.
- **After resolution:** Clears `agenda_current_card_id`; advances `agenda_phase_step` (`agenda_1_voting` → `agenda_1_resolved` → `agenda_2_voting` → `done`).

### Repeal logic (internal to `game-resolve-agenda`)
When a repeal agenda resolves, `game-resolve-agenda` applies the repeal inline — no separate Edge Function deployed. Sets `game_laws.is_repealed = true` on the target law; sets its `game_agenda_deck` row to `repealed`.

---

## UI Components

### `PlanetSelectionModal` (new, reusable)

A general-purpose planet picker configurable via props:

| Prop | Values | Purpose |
|---|---|---|
| `scope` | `'own'` \| `'any-player'` \| `'specific-player'` | Whose planets are shown |
| `filter` | `'non-exhausted'` \| `'exhausted'` \| `'all'` \| `'cultural'` \| `'industrial'` \| `'hazardous'` | Planet filter |
| `selectionMode` | `'single'` \| `'multi'` | Single target vs multiple exhaust |
| `valueMode` | `'influence'` \| `'resources'` \| `'none'` | Whether to display/sum planet values |
| `label` | string | Context string shown at top of modal |

Example configurations:
- **Agenda voting:** `scope: 'own'`, `filter: 'non-exhausted'`, `selectionMode: 'multi'`, `valueMode: 'influence'`
- **Elect Planet:** `scope: 'any-player'`, `filter: 'all'`, `selectionMode: 'single'`, `valueMode: 'none'`
- **Tech research / production:** `scope: 'own'`, `filter: 'non-exhausted'`, `selectionMode: 'multi'`, `valueMode: 'resources'`
- **Action card targeting:** flexible via props

### `AgendaSection` (new, in `GameScreen`)

Visible during agenda phase. Contains:
- Current agenda card (name, description, options) — or empty state with "Draw Agenda" if step is active but no card drawn
- Live vote totals per option (updated via Realtime)
- Per-player vote status: voted / abstaining / waiting
- Whose turn it is to vote (highlighted)
- **Speaker sees:** "Draw Agenda" button (when step active, no current card), "Resolve" button (when all votes in)
- **Host sees:** "Begin Agenda Phase" and "End Agenda Phase" in `HostControlsSection`

### `VotingPanel` (within `AgendaSection`)

- **Active player:** Option picker + `PlanetSelectionModal` trigger to select planets to exhaust; influence total populates vote count; "Abstain" button.
- **Non-active players:** Read-only view of vote status and totals.

### `AgendaResolutionModal` (speaker-only)

Triggered by "Resolve" button once all votes are in. Shows:
- Winning option
- Appropriate picker based on `elect_type`: player picker, `PlanetSelectionModal` (single), free-text input for laws, etc.
- For non-tractable agendas: "Host applies manually" banner with full effect text + confirm button.

### `EnactedLawsPanel` (persistent)

- Lists all active laws (name + elected target), collapsed by default, expandable.
- Repealed laws shown struck-through.
- New collapsible section in `GameScreen`, visible throughout the game.

---

## Realtime & Data Flow

### `useGame.js` additions

- **New subscription:** `game_agenda_votes` filtered by `game_id` — delivers live vote updates to all players.
- **Existing `games` subscription** covers `agenda_phase_step`, `agenda_current_card_id`, `agenda_vote_current_player_id` — no new subscription needed.
- **`game_laws`** fetched once on game load; re-fetched after each `game-resolve-agenda` call. No Realtime subscription (laws change infrequently).

### Vote total derivation

Computed client-side from `game_agenda_votes` rows in local state. No server round-trip for live tallies.

### `agenda_vote_current_player_id` flow

When this changes (via `games` subscription), `VotingPanel` re-renders — newly active player sees their vote interface; all others see read-only.

---

## Testing

Following existing Vitest + @testing-library/react patterns:

- **`player-order.ts` unit tests** — initiative order, reverse speaker order, wrap-around from last to first player.
- **Edge Function tests** per function:
  - Valid calls and happy-path state transitions
  - Permission checks (non-speaker draw/resolve rejected; out-of-turn vote rejected)
  - Vote count vs influence validation
  - Full-cycle detection (last voter → `agenda_vote_current_player_id = null`)
- **Component tests:** `AgendaSection`, `VotingPanel`, `AgendaResolutionModal`, `PlanetSelectionModal` — rendering per game state, speaker vs non-speaker views, tractable vs non-tractable resolution paths
- **`useGame` hook tests** — new `game_agenda_votes` Realtime subscription, vote state updates
