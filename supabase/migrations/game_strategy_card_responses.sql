CREATE TABLE public.game_strategy_card_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id          UUID        NOT NULL,
  player_id        UUID        NOT NULL,
  initiative_order INTEGER     NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  responded_at     TIMESTAMPTZ
);

ALTER TABLE public.game_strategy_card_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_strategy_card_responses_select" ON public.game_strategy_card_responses FOR SELECT USING (auth.role() = 'authenticated');
