# migration-032-promissory-effects
**File:** `supabase/migrations/032_promissory_effects.sql`
**Status:** New
**Prereqs:** —

## Changes
- `game_player_promissory_notes.state` CHECK: remove `'played'`, add `'in_play'`
- `games`: add `political_secret_blocked_player_id UUID REFERENCES game_players(id)`
- `game_system_activations`: add `movement_blocked_player_id UUID`, `faction_abilities_blocked_player_id UUID`, `gravity_rift_immune_player_id UUID`
- `game_combats`: add `reroll_allowed_player_id UUID`, `extra_die_player_id UUID`, `cavalry_active_player_id UUID`, `cavalry_unit_id UUID`, `tekklar_holder_player_id UUID`
- DO block seeding all 30 `ability_definitions` rows + `ability_sources` rows linking each to its `promissory_notes` row

## Tests
None. Verify: `npx supabase db push --linked` without error.
