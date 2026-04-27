# migration-033-leaders
**File:** `supabase/migrations/033_leaders.sql`
**Status:** New
**Prereqs:** —

## Functionality
```sql
CREATE TABLE public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS faction TEXT;
```
- `leaders` table stores faction leader reference cards; linked to ability system via `ability_sources (source_type='leader')`.
- `units.faction` (nullable): only mech rows carry a faction value; generic units leave it NULL.

## Tests
None — migration verified by running the full test suite after applying.
