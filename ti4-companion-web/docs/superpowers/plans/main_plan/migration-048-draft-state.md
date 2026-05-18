# migration-048-draft-state

**File:** `supabase/migrations/048_draft_state.sql`
**Status:** New
**Prereqs:** —

## Functionality

```sql
ALTER TABLE games ADD COLUMN draft_state JSONB;
```

## Tests

No direct test — covered by edge function tests that read/write `draft_state`.
