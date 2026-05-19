# migration-050-mech-abilities
**File:** `supabase/migrations/050_mech_abilities.sql`
**Status:** New
**Prereqs:** migration-033-leaders

## Functionality
```
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS ability_text   TEXT
  ADD COLUMN IF NOT EXISTS effects        JSONB NOT NULL DEFAULT '[]'
  ADD COLUMN IF NOT EXISTS deploy_trigger TEXT
```
- `ability_text`: faction-specific mech card text (null for generic units)
- `effects`: DSL ops array; empty array for generic and passive-only mechs
- `deploy_trigger`: enum `ground_combat_start | after_tech_research | after_retreat | after_produce | after_exploration`; null for non-deploy mechs

## Tests
- Migration is additive — all pre-existing tests still pass after applying
