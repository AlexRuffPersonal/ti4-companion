-- Phase 36+: Objective condition checks and combat ship tracking

ALTER TABLE public_objectives
  ADD COLUMN condition_check JSONB;
-- nullable: null means always-allowed (safe default for unimported rows)

ALTER TABLE secret_objectives
  ADD COLUMN condition_check JSONB;

ALTER TABLE game_combats
  ADD COLUMN ships_destroyed JSONB NOT NULL DEFAULT '{"attacker":{},"defender":{}}';
-- shape: { "attacker": { "fighter": 2, "destroyer": 1 }, "defender": { "cruiser": 1 } }
-- populated by game-assign-hits when a ship is destroyed
