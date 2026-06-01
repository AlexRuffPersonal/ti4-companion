CREATE TABLE public.game_player_legendary_cards (
  game_id     UUID NOT NULL,
  player_id   UUID NOT NULL,
  planet_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'readied'
    CHECK (status IN ('readied', 'exhausted')),
  PRIMARY KEY (game_id, planet_name)
);

ALTER TABLE public.game_player_legendary_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_legendary_cards_select" ON public.game_player_legendary_cards FOR SELECT USING (auth.role() = 'authenticated');
