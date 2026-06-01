CREATE TABLE public.game_strategy_card_plays (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                   UUID        NOT NULL,
  card_number               INTEGER     NOT NULL,
  played_by_player_id       UUID        NOT NULL,
  round                     INTEGER     NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'active',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  free_secondary_player_ids UUID[]      NOT NULL DEFAULT '{}'
);

ALTER TABLE public.game_strategy_card_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_strategy_card_plays_select" ON public.game_strategy_card_plays FOR SELECT USING (auth.role() = 'authenticated');
