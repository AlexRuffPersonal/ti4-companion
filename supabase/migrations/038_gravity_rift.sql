-- Phase 25: Gravity Rift

CREATE TABLE IF NOT EXISTS public.game_rift_transits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  system_key      TEXT NOT NULL,
  destination_key TEXT NOT NULL,
  player_id       UUID NOT NULL REFERENCES public.profiles(id),
  ships           JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_rift_transits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rift transits for their games"
  ON public.game_rift_transits FOR SELECT
  USING (auth.role() = 'authenticated');
