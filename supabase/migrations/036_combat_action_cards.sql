-- Phase 20: Space Combat Action Cards

ALTER TABLE game_combats
  ADD COLUMN IF NOT EXISTS window_passes        JSONB NOT NULL DEFAULT '{"attacker": false, "defender": false}',
  ADD COLUMN IF NOT EXISTS pending_effects      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sustained_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS destroyed_this_phase JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ships_moved_in       BOOLEAN NOT NULL DEFAULT false;
