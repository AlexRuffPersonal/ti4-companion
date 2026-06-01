CREATE TABLE public.game_player_planets (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID    NOT NULL,
  player_id           UUID    NOT NULL,
  planet_name         TEXT    NOT NULL,
  tile_id             UUID,
  exhausted           BOOLEAN NOT NULL DEFAULT false,
  space_dock_unit_id  UUID,
  pds_count           INTEGER NOT NULL DEFAULT 0,
  has_sleeper         BOOLEAN NOT NULL DEFAULT false,
  planet_destroyed    BOOLEAN NOT NULL DEFAULT false,
  attachments         UUID[]  NOT NULL DEFAULT '{}',
  tech_specialty      TEXT,
  influence           INTEGER NOT NULL DEFAULT 0,
  resources           INTEGER NOT NULL DEFAULT 0,
  explored            BOOLEAN NOT NULL DEFAULT false,
  terraform_attached  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, player_id, planet_name)
);

ALTER TABLE public.game_player_planets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_planets_select" ON public.game_player_planets FOR SELECT USING (auth.role() = 'authenticated');
