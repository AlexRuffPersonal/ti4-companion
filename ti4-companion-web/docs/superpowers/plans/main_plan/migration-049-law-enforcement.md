# migration-049-law-enforcement
**File:** `supabase/migrations/049_law_enforcement.sql`
**Status:** New
**Prereqs:** —

## Functionality
- CREATE INDEX IF NOT EXISTS idx_game_laws_game_active ON game_laws(game_id, is_repealed)
- ALTER TABLE game_players ADD COLUMN IF NOT EXISTS minister_of_war_unlocked BOOLEAN NOT NULL DEFAULT false
- ALTER TABLE game_laws ADD COLUMN IF NOT EXISTS elected_planet_name TEXT
  (stores the elected planet name for planet-elect laws; null for player-elect laws)

## Tests
- Migration applies cleanly against existing schema (no column conflict)
- INDEX visible in pg_indexes
- minister_of_war_unlocked column exists with correct default on game_players
