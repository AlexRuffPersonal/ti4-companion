CREATE TABLE public.game_system_state (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID    NOT NULL,
  system_key       TEXT    NOT NULL,
  tile_id          UUID,
  frontier_explored BOOLEAN NOT NULL DEFAULT false,
  has_space_station BOOLEAN NOT NULL DEFAULT false,
  entropic_scar    BOOLEAN NOT NULL DEFAULT false,
  wormhole_active  BOOLEAN NOT NULL DEFAULT true,
  ion_storm        BOOLEAN NOT NULL DEFAULT false,
  mirage_present   BOOLEAN NOT NULL DEFAULT false,
  space_mines      JSONB   NOT NULL DEFAULT '[]',
  combat_active    BOOLEAN NOT NULL DEFAULT false,
  has_mirage       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, system_key)
);

ALTER TABLE public.game_system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_state_select" ON public.game_system_state FOR SELECT USING (auth.role() = 'authenticated');
