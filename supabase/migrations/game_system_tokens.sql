CREATE TABLE public.game_system_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL,
  system_key TEXT        NOT NULL,
  player_id  UUID        NOT NULL,
  token_type TEXT        NOT NULL DEFAULT 'retreat_cc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX game_system_tokens_game_id ON public.game_system_tokens (game_id);

ALTER TABLE public.game_system_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_tokens_game_members" ON public.game_system_tokens FOR SELECT TO authenticated
  USING (game_id IN (SELECT game_id FROM public.game_players WHERE user_id = auth.uid()));
