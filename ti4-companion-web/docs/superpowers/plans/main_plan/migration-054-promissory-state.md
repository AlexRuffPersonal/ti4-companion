# migration-054-promissory-state
**File:** `supabase/migrations/054_promissory_state.sql`
**Status:** New
**Prereqs:** —

## Functionality

Extend the `game_player_promissory_notes.state` CHECK constraint to include `'discarded'`.

Current constraint: `CHECK (state IN ('held', 'in_play'))`.

New constraint: `CHECK (state IN ('held', 'in_play', 'discarded'))`.

The `purge_on_use` code path in `game-play-promissory-note` writes `state='discarded'`; without this migration the UPDATE silently fails with a CHECK violation.

```sql
ALTER TABLE public.game_player_promissory_notes
  DROP CONSTRAINT game_player_promissory_notes_state_check;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play', 'discarded'));
```

## Tests

No direct migration test. Covered indirectly by the `purge_on_use` happy-path test in `game-play-promissory-note.test.js`.
