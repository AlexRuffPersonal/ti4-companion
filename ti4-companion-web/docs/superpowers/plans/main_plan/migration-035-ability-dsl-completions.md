# migration-035-ability-dsl-completions

**File:** `supabase/migrations/035_ability_dsl_completions.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_players
  ADD COLUMN vote_prevented BOOLEAN NOT NULL DEFAULT false;
```

No other schema changes. All Phase 19 ops work with existing tables.

## Tests

None. Verify: `supabase db push` without error.
