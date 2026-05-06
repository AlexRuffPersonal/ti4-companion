-- Phase 19: Ability DSL Completions

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS vote_prevented BOOLEAN NOT NULL DEFAULT false;
