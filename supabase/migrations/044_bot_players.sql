-- Phase 33: Bot Players

ALTER TABLE game_players
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bot_strategy TEXT CHECK (bot_strategy IN ('random', 'scripted'));
