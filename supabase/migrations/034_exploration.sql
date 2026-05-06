-- Phase 17: Exploration / Relics

ALTER TABLE public.game_player_planets
  ADD COLUMN IF NOT EXISTS explored BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.game_relic_deck
  ADD COLUMN IF NOT EXISTS exhausted BOOLEAN NOT NULL DEFAULT false;
