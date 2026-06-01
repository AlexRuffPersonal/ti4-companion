CREATE TABLE public.game_agenda_votes (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID    NOT NULL,
  game_player_id UUID    NOT NULL,
  agenda_id      UUID    NOT NULL,
  choice         TEXT,
  vote_count     INTEGER NOT NULL DEFAULT 0,
  abstained      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, game_player_id, agenda_id)
);

ALTER TABLE public.game_agenda_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_agenda_votes_select" ON public.game_agenda_votes FOR SELECT USING (auth.role() = 'authenticated');
