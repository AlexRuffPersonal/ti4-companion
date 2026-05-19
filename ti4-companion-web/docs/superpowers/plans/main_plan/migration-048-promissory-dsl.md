# migration-048-promissory-dsl
**File:** `supabase/migrations/048_promissory_dsl.sql`
**Status:** New
**Prereqs:** migration-032-promissory-effects

## Functionality
- ALTER TABLE game_player_promissory_notes ADD COLUMN IF NOT EXISTS metadata JSONB
- ALTER TABLE game_player_planets ADD COLUMN IF NOT EXISTS terraform_attached BOOLEAN NOT NULL DEFAULT false
- UPDATE promissory_notes SET into_play_area = true WHERE name = 'Terraform'

## Tests
- Migration applies without error on top of existing schema
