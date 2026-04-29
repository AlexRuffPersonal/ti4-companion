# migration-043-tech-effects

**File:** `supabase/migrations/043_tech_effects.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_players
  ADD COLUMN exhausted_technologies TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE game_players
  ADD COLUMN second_action_available BOOLEAN NOT NULL DEFAULT FALSE;
```

No new `pending_action_window` types require schema changes — new type strings are added as code constants only.

## Tests

None. Verify: `supabase db push` without error.
