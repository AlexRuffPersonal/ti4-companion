CREATE TABLE public.game_rift_transits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID        NOT NULL,
  system_key      TEXT        NOT NULL,
  destination_key TEXT        NOT NULL,
  player_id       UUID        NOT NULL,
  ships           JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_rift_transits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_rift_transits_select" ON public.game_rift_transits FOR SELECT USING (auth.role() = 'authenticated');
