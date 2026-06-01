CREATE TABLE public.game_transactions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                   UUID        NOT NULL,
  from_player_id            UUID        NOT NULL,
  to_player_id              UUID        NOT NULL,
  items                     JSONB       NOT NULL DEFAULT '{}',
  round                     INTEGER     NOT NULL,
  phase                     TEXT        NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                    TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'rescinded')),
  confirmed_at              TIMESTAMPTZ,
  active_player_id          UUID,
  vote_sequence_at_creation INTEGER
);

ALTER TABLE public.game_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_transactions_select" ON public.game_transactions FOR SELECT USING (auth.role() = 'authenticated');
