# migration-036-combat-action-cards

**File:** `supabase/migrations/036_combat_action_cards.sql`
**Status:** New
**Prereqs:** —

## Functionality

```sql
ALTER TABLE game_combats
  ADD COLUMN window_passes        JSONB NOT NULL DEFAULT '{"attacker": false, "defender": false}',
  ADD COLUMN pending_effects      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN sustained_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN destroyed_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN ships_moved_in       BOOLEAN NOT NULL DEFAULT false;
```

`window_passes` — tracks which side has passed in the current action-card window.
`pending_effects` — accumulates card modifiers (morale_boost, shields_holding, etc.) consumed by the next combat step.
`sustained_this_phase` — `[{player_id, unit_id, unit_type}]` list of units that Sustained this assignment phase; Direct Hit reads this.
`destroyed_this_phase` — `[{player_id, unit_id, unit_type, combat_value}]` list of units destroyed this assignment phase; Courageous To The End reads this.
`ships_moved_in` — set by `game-activate-system`; Experimental Battlestation is invalid if false.

## Tests

None — schema only.
