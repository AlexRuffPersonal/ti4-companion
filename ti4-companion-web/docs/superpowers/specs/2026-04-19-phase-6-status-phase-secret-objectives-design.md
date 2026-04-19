# Phase 6 — Status Phase + Secret Objectives Design

**Goal:** Complete the per-round loop. Every round ends with a status phase; secret objectives are a core scoring mechanism from round 1.

**Architecture:** One new migration adds two boolean flags to `game_players`. Five Edge Functions handle the full flow: game-start is patched to deal secrets, two new functions manage secret discard and scoring, game-status-phase runs the full end-of-round transition atomically, and game-update-command-tokens is updated to set a redistribution flag. Two blocking UI gates (secret selection pre-game, token redistribution post-status-phase) are driven by the per-player flags via the existing Realtime subscription.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react, Deno/TypeScript (Edge Functions)

---

## Migration

**File:** `supabase/migrations/024_phase6.sql`

```sql
ALTER TABLE public.game_players
  ADD COLUMN secrets_selected      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tokens_redistributed  BOOLEAN NOT NULL DEFAULT true;
```

`secrets_selected` starts false for all players at game start. Set to true when a player discards their unwanted secret objective (initial selection). Mid-game discards leave this flag unchanged.

`tokens_redistributed` starts true by default (no redistribution needed outside of status phase). Set to false for all players by `game-status-phase` at end of each round. Set back to true by `game-update-command-tokens` whenever a player submits a new token split.

Both flags flow to all clients via the existing `game_players` Realtime subscription — no extra queries needed for the host to see who has pending actions.

---

## Edge Function Contracts

### `game-start` (patch)
Fetch all `secret_objectives` filtered by active expansions. Shuffle. Deal 2 to each player as rows in `game_player_secret_objectives` with `state = 'held'` and `player_id` set to the player's id. Fail with 409 if fewer than `2 × player_count` eligible secret objectives exist in the reference table.

### `game-discard-secret-objective` (new)
**Input:** `game_id`, `objective_id`

**Validates:**
- Caller is a player in the game
- Objective row exists with `state = 'held'` and `player_id = caller`

**On success:**
- Fetch current deck size (`COUNT` where `state = 'deck'` for this game)
- Assign card a random `deck_position` within `[0, deck_size]`
- Set row `state = 'deck'`, clear `player_id`
- If caller's `secrets_selected` is currently `false`, set it to `true`

Callable any time a player holds a secret objective — not just during initial selection. The `secrets_selected` flag update only fires when it was previously false.

### `game-score-secret-objective` (new)
**Input:** `game_id`, `objective_id`

**Validates:**
- Caller holds the objective (`state = 'held'`, `player_id = caller`)
- `game.phase` matches the objective's `timing` field (e.g. `'status'`, `'action'`)
- Caller has not already scored a secret this round (`no row with state = 'scored' AND scored_at_round = game.round`)

**On success:**
- Set row `state = 'scored'`, `scored_at_round = game.round`
- Increment caller's `vp` by 1

### `game-status-phase` (new)
**Input:** `game_id`

**Validates:**
- Caller is host (or `permissions_mode = 'all'`)
- All players have `passed = true`

**On success (atomic):**
- Set all `game_player_planets.exhausted = false` for this game
- Set all `game_player_units.damaged_count = 0` for this game
- Delete all `game_system_activations` rows for this game
- Increment every player's `command_tokens.tactic_total` by 2
- Set all players `tokens_redistributed = false`
- Set all players `passed = false`
- Increment `games.round` by 1
- Set `games.phase = 'strategy'`

Speaker (`games.speaker_player_id`) is not changed — speaker only changes via explicit game effects.

### `game-update-command-tokens` (updated)
Existing function gains one additional step after saving new token values: set `tokens_redistributed = true` on the calling player's row. Validation unchanged: `tactic_total + fleet + strategy ≤ 16`.

This function is used both during the status phase redistribution flow and during action phase effects that allow redistribution (e.g. certain faction abilities). In both cases setting `tokens_redistributed = true` is correct.

---

## UI Components and Flow

### SecretObjectiveSelectionScreen
Shown to any player whose `secrets_selected = false` when they load the game screen. Replaces the normal game UI entirely — a full blocking gate. Shows both held secret objective cards (name, timing, condition). Player clicks "Discard" on one card, which calls `game-discard-secret-objective`. On success the screen dismisses and the normal game UI loads.

Host sees a banner in their game UI listing which players haven't completed selection yet (derived from `players.filter(p => !p.secrets_selected)`). The host's own selection screen behaves identically to other players.

### SecretObjectivesModal
Opened via a private "Secrets (N)" button in `MyPanelSection`, visible only to the owning player. Shows held secret objective cards with name, timing, and condition. Each card has a "Score" button that is active only when `game.phase === 'status'` and the objective's timing matches the current phase. Calls `game-score-secret-objective` on click.

On the scoreboard (`ScoreboardSection`), other players see only a count badge (`✦ N`) next to the player's name — no card names are exposed.

### Status Phase Flow
The Status Phase begins when the host advances from the Action Phase via the existing `game-advance-phase`. During `phase = 'status'`:

- The existing `ObjectivesSection` shows "Score" buttons on eligible public objectives. These buttons are gated to `phase = 'status'` only.
- Each player sees their "Secrets (N)" button in `MyPanelSection` to open `SecretObjectivesModal` and score an eligible secret.
- The `HostControlsSection` shows an **"End Status Phase"** button. This button is always enabled during the status phase — the host clicks it when the group has finished scoring. Calls `game-status-phase`.

After `game-status-phase` fires, each player sees the `TokenRedistributionModal` — a blocking overlay that prevents access to the strategy phase UI until submitted. The host panel shows which players haven't redistributed yet (`players.filter(p => !p.tokens_redistributed)`).

### TokenRedistributionModal
Blocking overlay shown to any player whose `tokens_redistributed = false`. Displays current token totals. Provides +/− controls for tactic, fleet, and strategy, constrained so the total always equals the player's current `tactic_total + fleet + strategy`. Submitting calls `game-update-command-tokens` with the new split. On success the modal dismisses and the strategy phase UI loads.

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/024_phase6.sql` |
| Modify | `supabase/functions/game-start/index.ts` |
| Create | `supabase/functions/game-discard-secret-objective/index.ts` |
| Create | `supabase/functions/game-score-secret-objective/index.ts` |
| Create | `supabase/functions/game-status-phase/index.ts` |
| Modify | `supabase/functions/game-update-command-tokens/index.ts` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Modify | `ti4-companion-web/src/hooks/useGame.js` |
| Create | `ti4-companion-web/src/components/game/SecretObjectiveSelectionScreen.jsx` |
| Create | `ti4-companion-web/src/components/game/SecretObjectivesModal.jsx` |
| Create | `ti4-companion-web/src/components/game/TokenRedistributionModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Modify | `ti4-companion-web/src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/ScoreboardSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/ObjectivesSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/HostControlsSection.jsx` |
| Create | `ti4-companion-web/tests/functions/game-start.phase6.test.js` |
| Create | `ti4-companion-web/tests/functions/game-discard-secret-objective.test.js` |
| Create | `ti4-companion-web/tests/functions/game-score-secret-objective.test.js` |
| Create | `ti4-companion-web/tests/functions/game-status-phase.test.js` |
| Create | `ti4-companion-web/tests/functions/game-update-command-tokens.phase6.test.js` |
| Create | `ti4-companion-web/tests/components/game/SecretObjectiveSelectionScreen.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/SecretObjectivesModal.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/TokenRedistributionModal.test.jsx` |

---

## Testing Approach

All tests follow the established TDD pattern: failing tests written first, implementation second.

| Test file | What it covers |
|---|---|
| `game-start.phase6.test.js` | Deals exactly 2 secrets per player; filtered by expansion; fails if deck too small |
| `game-discard-secret-objective.test.js` | Happy path; shuffles back into deck with random position; sets `secrets_selected` only if was false; rejects if not held by caller; callable during standard game |
| `game-score-secret-objective.test.js` | Awards VP; validates timing vs phase; rejects if already scored this round; rejects if not held |
| `game-status-phase.test.js` | Readies planets; repairs units; clears activations; grants +2 tactic; sets `tokens_redistributed = false`; resets `passed`; increments round; rejects if any player not passed |
| `game-update-command-tokens.phase6.test.js` | Sets `tokens_redistributed = true` after update; existing token validation still passes |
| `SecretObjectiveSelectionScreen.test.jsx` | Shows both cards; discard calls function; dismisses after selection; host sees pending players list |
| `SecretObjectivesModal.test.jsx` | Private hand view; score button active only in status phase with matching timing; count badge on scoreboard shows count only |
| `TokenRedistributionModal.test.jsx` | Controls constrained to current total; submit calls `game-update-command-tokens`; blocking overlay dismisses on success |
