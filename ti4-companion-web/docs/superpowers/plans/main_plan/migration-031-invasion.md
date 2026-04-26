# migration-031-invasion

**File:** `supabase/migrations/031_invasion.sql`
**Status:** New
**Prereqs:** migration-030-afb

## Changes

```sql
-- Extend combat_type CHECK to include bombardment rows
-- Drop and recreate (Postgres requires this to change CHECK constraints)
ALTER TABLE game_combats DROP CONSTRAINT game_combats_combat_type_check;
ALTER TABLE game_combats ADD CONSTRAINT game_combats_combat_type_check
  CHECK (combat_type IN ('space', 'ground', 'bombardment'));

-- Extend phase CHECK to include AFB assign, bombardment assign, SCD phases
ALTER TABLE game_combats DROP CONSTRAINT game_combats_phase_check;
ALTER TABLE game_combats ADD CONSTRAINT game_combats_phase_check
  CHECK (phase IN (
    'barrage',
    'afb_attacker_assign', 'afb_defender_assign',
    'attacker_roll', 'defender_roll',
    'attacker_assign', 'defender_assign',
    'bombardment_assign',
    'scd_fire', 'scd_assign',
    'complete'
  ));

-- SCD result columns on ground combat rows
ALTER TABLE game_combats
  ADD COLUMN scd_dice  JSONB,
  ADD COLUMN scd_hits  INTEGER NOT NULL DEFAULT 0;

-- Bombardment done flag — set by game-advance-bombardment before troops can commit
ALTER TABLE game_system_activations
  ADD COLUMN bombardment_done BOOLEAN NOT NULL DEFAULT false;
```

- Existing `game_combats` rows are unaffected (all existing phases remain valid).
- `bombardment` combat rows are temporary: created by `game-fire-bombardment`, resolved via `game-assign-hits`, then `phase='complete'`.
- `scd_dice` / `scd_hits` are null/0 on space combat rows; populated only for `combat_type='ground'` rows that pass through `scd_fire`.

## Tests

None. Verify: `supabase db push` without error.
