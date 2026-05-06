-- Phase 29a: Action Card Effect Enforcement

-- DSL storage on action cards reference table (null = effect not yet authored)
ALTER TABLE public.action_cards
  ADD COLUMN IF NOT EXISTS ability JSONB;

-- Signal Jamming / Solar Flare: blocked systems cleared at round end by game-advance-phase
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS movement_blocked_systems TEXT[] NOT NULL DEFAULT '{}';

-- Blitz: consumed and reset to 0 when game-produce-units runs
ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS production_bonus INT NOT NULL DEFAULT 0;

-- Ghost Ship: checked by game-move-ships; reset to false at round end by game-advance-phase
ALTER TABLE public.game_player_units
  ADD COLUMN IF NOT EXISTS no_move_this_round BOOLEAN NOT NULL DEFAULT false;
