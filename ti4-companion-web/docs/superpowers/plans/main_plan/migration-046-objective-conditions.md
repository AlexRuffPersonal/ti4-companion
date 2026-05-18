# migration-046-objective-conditions
**File:** `supabase/migrations/046_objective_conditions.sql`
**Status:** New
**Prereqs:** —

## Functionality

```pseudocode
ALTER TABLE public_objectives
  ADD COLUMN condition_check JSONB;
-- nullable: null means always-allowed (safe default for unimported rows)

ALTER TABLE secret_objectives
  ADD COLUMN condition_check JSONB;

ALTER TABLE game_combats
  ADD COLUMN ships_destroyed JSONB NOT NULL DEFAULT '{"attacker":{},"defender":{}}';
-- shape: { "attacker": { "fighter": 2, "destroyer": 1 }, "defender": { "cruiser": 1 } }
-- populated by game-assign-hits when a ship is destroyed
```

## Tests

```pseudocode
it('migration applies cleanly against current schema')
it('existing public_objectives rows have null condition_check after migration')
it('existing game_combats rows have default ships_destroyed after migration')
```
