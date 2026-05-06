-- Phase 21: Legendary Planets & Wormhole Nexus

CREATE TABLE IF NOT EXISTS public.game_player_legendary_cards (
  game_id     UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  planet_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'readied' CHECK (status IN ('readied', 'exhausted')),
  PRIMARY KEY (game_id, planet_name)
);

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS wormhole_nexus_active BOOLEAN NOT NULL DEFAULT false;
