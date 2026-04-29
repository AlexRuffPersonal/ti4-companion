# migration-045-event-log

**File:** `supabase/migrations/045_event_log.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_events
  ADD COLUMN undone_at TIMESTAMPTZ,
  ADD COLUMN undo_of UUID REFERENCES game_events(id);
```

- `undone_at` — null = active event; non-null = timestamp when it was undone
- `undo_of` — reversal rows reference the event they reverse; null for original events

Active-event queries must filter `WHERE undone_at IS NULL`.

## Tests

None. Verify: `supabase db push` without error; existing rows unaffected (both columns default null).
