CREATE TABLE public.game_public_objectives (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID    NOT NULL,
  objective_id     UUID    NOT NULL,
  revealed_at_round INTEGER,
  scored_by        UUID[]  NOT NULL DEFAULT '{}',
  deck_position    INTEGER,
  state            TEXT    NOT NULL DEFAULT 'deck'
);

ALTER TABLE public.game_public_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_public_objectives_select" ON public.game_public_objectives FOR SELECT USING (auth.role() = 'authenticated');
