# Phase 26 — Player Elimination Design

**Date:** 2026-04-28  
**Phase:** 26  
**Feature area:** Player Elimination  
**Rules basis:** LRR §33 (Elimination)

---

## Overview

When a player meets all three §33.1 conditions simultaneously, they are automatically eliminated. Their session persists as a spectator — they can still see the game but cannot take actions. All components are cleaned up per §33.2–33.11.

**Elimination conditions (§33.1):**
- No ground forces (infantry or mech) anywhere on the board
- No unit with a Production ability (Space Dock) anywhere on the board
- No controlled planets

---

## Schema

**Migration `039_elimination.sql`:**

```sql
ALTER TABLE public.game_players
  ADD COLUMN eliminated BOOLEAN NOT NULL DEFAULT false;
```

No other schema changes. Cleanup operates on existing tables (delete from `game_player_units`, `game_system_activations`; null out `game_system_state.controller_player_id`; updates to hand/deck tables).

---

## Architecture

### `_shared/eliminationHandler.ts`

Exports `checkAndEliminate(db, gameId): Promise<string[]>` — returns an array of eliminated `player_id`s.

**Detection:** For each non-eliminated player, run a single SQL query checking all three §33.1 conditions. A player is eligible if all three return zero rows.

**Cleanup — executed in one DB transaction per eliminated player:**

1. Delete all rows from `game_player_units` for the player (§33.2)
2. Delete all rows from `game_system_activations` for the player (§33.2)
3. Set `controller_player_id = null` on all `game_system_state` rows they control (§33.2)
4. Promissory notes in their hand (§33.4):
   - Notes matching another player's faction/colour → return to that player's hand
   - Notes matching the eliminated player → discard
5. Delete all action cards from their hand (§33.5)
6. Shuffle their secret objectives back into the deck — set status to `in_deck`, randomise order (§33.7)
7. Set `strategy_card = null`, `strategy_card_2 = null` (§33.6)
8. Speaker handoff (§33.8): if `games.speaker_player_id = player_id`, pass to next `seat_index` (ascending, wrapping, skipping already-eliminated players)
9. Set `eliminated = true` on `game_players`

**§33.10 faction-specific rules:**

- **Mahact Gene-Sorcerers eliminated:** For each entry in `tokens_captured_from`, increment the original player's `command_tokens.tactic_total` by the count; clear `tokens_captured_from` (§33.10e).
- **Mahact has a captured token from an already-eliminated player:** The token remains in play; the eliminated player's commander remains active if unlocked (§33.10f). No cleanup action needed.
- **Creuss wormhole tokens:** Remain on the board (§33.10b). No cleanup action needed — wormhole rows in `game_system_state` have no owner FK.
- **Nekro assimilator tokens:** The assimilated technology is on Nekro's own `technologies[]` array and is unaffected by the eliminated player's cleanup (§33.10a).

**§33.9:** If player count drops from ≥5 to ≤4 via elimination, players continue selecting one strategy card. This is already the current behaviour — no code change required.

### Edge Function modifications

Two existing Edge Functions call `checkAndEliminate` after their primary logic succeeds:

| Edge Function | Why |
|---|---|
| `game-assign-hits` | Removes ships/ground forces from combat; can exhaust all units |
| `game-land-troops` | Transfers planet control on successful invasion |

Both append `eliminatedPlayerIds: string[]` to their success response body.

**Future Edge Functions** that modify unit counts or planet control must also call `checkAndEliminate`. This includes (not exhaustive): `game-commit-ground-forces` (Phase 11/14), `game-advance-bombardment` (Phase 14), `game-resolve-agenda` (when agenda effects destroy units).

### Client — spectator mode

**`useGame.js`:** Expose `isEliminated = currentPlayer?.eliminated ?? false`.

**`GameScreen.jsx`:**
- When `isEliminated`: render an "Eliminated" banner (`bg-danger/20 text-danger`) at the top of the screen; suppress all action panels (strategy assignment, end-turn, combat, etc.).
- Galaxy map and other read-only views remain visible.

**Player list components:** Use each player's `eliminated` field to render a dimmed/greyed state for eliminated players (dimmed name, muted VP display).

**Realtime:** No special handling needed. The `eliminated = true` write triggers the existing `game_players` Realtime subscription, which refreshes state automatically.

---

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/039_elimination.sql` | New — add `eliminated` column |
| `supabase/functions/_shared/eliminationHandler.ts` | New — detection + cleanup logic |
| `supabase/functions/game-assign-hits/index.ts` | Modify — call `checkAndEliminate` after hits applied |
| `supabase/functions/game-land-troops/index.ts` | Modify — call `checkAndEliminate` after invasion resolves |
| `src/hooks/useGame.js` | Modify — expose `isEliminated` |
| `src/components/game/GameScreen.jsx` | Modify — eliminated banner + suppress action panels |
| `tests/lib/eliminationHandler.test.js` | New — unit tests for shared module |
| `tests/functions/game-assign-hits.test.js` | Modify — add elimination response test |
| `tests/components/GameScreen.test.jsx` | Modify — add spectator mode tests |

---

## Testing

**`eliminationHandler.test.js`:**
- No units + no planets → eliminated
- Has Space Dock only (no planets, no ground forces) → eliminated
- Has ground forces on controlled planet → not eliminated
- Speaker eliminated → speaker passes to next seat (ascending, wrapping)
- Speaker eliminated → skips already-eliminated players when passing
- Mahact eliminated with captured tokens → `tactic_total` incremented for original owners
- Mahact holds token from already-eliminated player → no change (§33.10f)
- Foreign promissory notes → returned to owner; own-faction notes → discarded
- Secret objectives → status set to `in_deck`
- Strategy cards → cleared to null

**`game-assign-hits.test.js` (addition):**
- Last ship destroyed for player with no planets and no ground forces → response includes `eliminatedPlayerIds`

**`GameScreen.test.jsx` (additions):**
- `currentPlayer.eliminated = true` → banner renders, action panels absent
- Another player `eliminated = true` → dimmed in player list
