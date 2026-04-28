# migration-039-elimination
**File:** `supabase/migrations/039_elimination.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE public.game_players
  ADD COLUMN eliminated BOOLEAN NOT NULL DEFAULT false;
```

RLS: no change — existing `game_players` policies cover this column.

## Tests

None. Verify: `supabase db push` without error.
