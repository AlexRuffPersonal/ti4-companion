-- Strategy card play tracking
CREATE TABLE public.game_strategy_card_plays (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  card_number         INTEGER NOT NULL,
  played_by_player_id UUID NOT NULL REFERENCES public.game_players(id),
  round               INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active', -- 'active' | 'complete'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-player secondary response rows (one per other player per play)
CREATE TABLE public.game_strategy_card_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id          UUID NOT NULL REFERENCES public.game_strategy_card_plays(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES public.game_players(id),
  initiative_order INTEGER NOT NULL, -- clockwise seat distance from active player
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'used' | 'passed'
  responded_at     TIMESTAMPTZ
);

-- Replace has_space_dock boolean with typed FK for production stat lookup
ALTER TABLE public.game_player_planets
  DROP COLUMN has_space_dock,
  ADD COLUMN space_dock_unit_id UUID REFERENCES public.units(id);

-- Replace has_pds boolean with count (LRR 63.3: max 2 PDS per planet)
ALTER TABLE public.game_player_planets
  DROP COLUMN has_pds,
  ADD COLUMN pds_count INTEGER NOT NULL DEFAULT 0;
