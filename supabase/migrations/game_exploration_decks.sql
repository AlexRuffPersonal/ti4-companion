CREATE TABLE public.game_exploration_decks (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL,
  card_id               UUID    NOT NULL,
  deck_type             TEXT    NOT NULL,
  deck_position         INTEGER,
  state                 TEXT    NOT NULL DEFAULT 'deck',
  resolved_by_player_id UUID,
  system_key            TEXT
);

ALTER TABLE public.game_exploration_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_exploration_decks_select" ON public.game_exploration_decks FOR SELECT USING (auth.role() = 'authenticated');
