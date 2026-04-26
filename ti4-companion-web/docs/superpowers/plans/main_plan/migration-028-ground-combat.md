# migration-028-ground-combat

**File:** `supabase/migrations/028_ground_combat.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_combats
  ADD COLUMN combat_type TEXT NOT NULL DEFAULT 'space',
  ADD COLUMN planet_name TEXT NULL;
```

- `combat_type`: `'space'` (all existing rows) | `'ground'` (new)
- `planet_name`: null for space; planet name for ground

## Tests

None. Verify: `supabase db push` without error.
