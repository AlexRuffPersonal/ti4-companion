-- Phase 43a: Leader Card Abilities
-- Adds commander_flags and game_round_flags columns for tracking
-- unlock conditions and round-scoped hero/ability state

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS commander_flags JSONB NOT NULL DEFAULT '{}';

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_round_flags JSONB NOT NULL DEFAULT '{}';
