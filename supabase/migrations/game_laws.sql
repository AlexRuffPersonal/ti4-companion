CREATE TABLE public.game_laws (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL,
  agenda_id             UUID    NOT NULL,
  round_enacted         INTEGER NOT NULL,
  elected_target        TEXT,
  is_repealed           BOOLEAN NOT NULL DEFAULT false,
  host_applies_manually BOOLEAN NOT NULL DEFAULT false,
  elected_planet_name   TEXT
);

CREATE INDEX idx_game_laws_game_active ON public.game_laws (game_id, is_repealed);

ALTER TABLE public.game_laws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_laws_select" ON public.game_laws FOR SELECT USING (auth.role() = 'authenticated');
