ALTER TABLE public.game_exploration_decks
  ADD COLUMN IF NOT EXISTS system_key TEXT;

ALTER TABLE public.game_system_state
  ADD COLUMN IF NOT EXISTS has_mirage BOOLEAN NOT NULL DEFAULT false;
