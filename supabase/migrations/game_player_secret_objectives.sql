CREATE TABLE public.game_player_secret_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID    NOT NULL,
  player_id       UUID    NOT NULL,
  objective_id    UUID    NOT NULL,
  state           TEXT    NOT NULL DEFAULT 'held',
  scored_at_round INTEGER,
  deck_position   INTEGER
);

ALTER TABLE public.game_player_secret_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_secret_objectives_select" ON public.game_player_secret_objectives FOR SELECT USING (
  player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
