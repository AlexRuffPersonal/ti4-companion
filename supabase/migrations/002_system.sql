-- ── Game System State ────────────────────────────────────────────────────────
CREATE TABLE public.game_system_state (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  system_key         TEXT NOT NULL,
  tile_id            UUID,                           -- FK to tiles added in 005_reference.sql
  frontier_explored  BOOLEAN NOT NULL DEFAULT false,
  has_space_station  BOOLEAN NOT NULL DEFAULT false,
  entropic_scar      BOOLEAN NOT NULL DEFAULT false,
  wormhole_active    BOOLEAN NOT NULL DEFAULT true,
  ion_storm          BOOLEAN NOT NULL DEFAULT false,
  mirage_present     BOOLEAN NOT NULL DEFAULT false,
  space_mines        JSONB NOT NULL DEFAULT '[]',
  combat_active      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, system_key)
);

-- ── Game System Activations ──────────────────────────────────────────────────
CREATE TABLE public.game_system_activations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  system_key     TEXT NOT NULL,
  round          INTEGER NOT NULL,
  token_owner_id UUID REFERENCES public.game_players(id),
  UNIQUE (game_id, player_id, system_key, round)
);
