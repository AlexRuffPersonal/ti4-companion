CREATE TABLE public.game_relic_deck (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  relic_id          UUID    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'deck',
  held_by_player_id UUID,
  deck_position     INTEGER,
  exhausted         BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.game_relic_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_relic_deck_select" ON public.game_relic_deck FOR SELECT USING (auth.role() = 'authenticated');
