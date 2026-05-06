-- Phase 26: Player Elimination

ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS eliminated BOOLEAN NOT NULL DEFAULT false;
