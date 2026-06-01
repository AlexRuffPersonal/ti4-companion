CREATE TABLE public.game_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL,
  player_id  UUID,
  event_type TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  round      INTEGER     NOT NULL,
  phase      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at  TIMESTAMPTZ,
  undo_of    UUID
);

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_events_select" ON public.game_events FOR SELECT USING (auth.role() = 'authenticated');
