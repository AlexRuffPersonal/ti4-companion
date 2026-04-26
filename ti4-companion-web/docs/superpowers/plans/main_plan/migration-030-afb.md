# migration-030-afb

**File:** `supabase/migrations/030_afb.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_combats
  ADD COLUMN barrage_attacker_dice JSONB,
  ADD COLUMN barrage_defender_dice JSONB,
  ADD COLUMN barrage_attacker_hits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN barrage_defender_hits INTEGER NOT NULL DEFAULT 0;
```

- Null `barrage_attacker_dice` = barrage not yet fired (or no AFB units in system)
- Non-null = results stored, attacker can advance to `attacker_roll`
- `'barrage'` phase already in `game_combats.phase` CHECK — no constraint change needed

## Tests

None. Verify: `supabase db push` without error.
