# migration-052-leader-abilities
**File:** `supabase/migrations/052_leader_abilities.sql`
**Status:** New
**Prereqs:** —

## Functionality
```sql
ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS commander_flags JSONB NOT NULL DEFAULT '{}';

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_round_flags JSONB NOT NULL DEFAULT '{}';
```

- `commander_flags`: stores honour-checked unlock conditions that can't be derived from current game state alone (e.g. `used_indoctrination`, `entered_mecatol_combat`).
- `game_round_flags`: stores round-scoped state set by hero abilities that expire at round end (e.g. `letnev_no_fleet_limit`, `nomad_flagship_ignores_tokens`). Cleared to `{}` in `game-advance-phase` at end of round.

## Tests
None — migration verified by running full test suite after applying.
