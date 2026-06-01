CREATE TABLE public.game_player_units (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID    NOT NULL,
  player_id          UUID    NOT NULL,
  system_key         TEXT    NOT NULL,
  unit_type_id       UUID    NOT NULL,
  count              INTEGER NOT NULL DEFAULT 0,
  damaged_count      INTEGER NOT NULL DEFAULT 0,
  on_planet          TEXT,
  no_move_this_round BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.game_player_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_units_select" ON public.game_player_units FOR SELECT USING (auth.role() = 'authenticated');
