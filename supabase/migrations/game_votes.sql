CREATE TABLE public.game_votes (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID    NOT NULL,
  agenda_id  UUID    NOT NULL,
  player_id  UUID    NOT NULL,
  round      INTEGER NOT NULL,
  choice     TEXT    NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, agenda_id, player_id, round)
);

ALTER TABLE public.game_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_votes_select" ON public.game_votes FOR SELECT USING (auth.role() = 'authenticated');
