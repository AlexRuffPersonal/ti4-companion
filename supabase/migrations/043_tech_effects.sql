-- Phase 30: Technology Effect Enforcement

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS exhausted_technologies TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS second_action_available BOOLEAN NOT NULL DEFAULT FALSE;
