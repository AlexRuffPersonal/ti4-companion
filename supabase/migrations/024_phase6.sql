-- Phase 6: Status Phase + Secret Objectives
-- Adds player flags for blocking UI gates and secret objective tracking.
-- Also adds deck_position to game_player_secret_objectives (missing from initial schema).

ALTER TABLE public.game_players
  ADD COLUMN secrets_selected       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tokens_redistributed   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN secret_objective_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.game_player_secret_objectives
  ADD COLUMN deck_position INTEGER;