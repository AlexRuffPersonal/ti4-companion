CREATE TABLE public.game_player_promissory_notes (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  note_id           UUID    NOT NULL,
  origin_player_id  UUID    NOT NULL,
  held_by_player_id UUID    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'held'
    CONSTRAINT game_player_promissory_notes_state_check
    CHECK (state IN ('held', 'in_play')),
  metadata          JSONB
);

ALTER TABLE public.game_player_promissory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_promissory_notes_select" ON public.game_player_promissory_notes FOR SELECT USING (auth.role() = 'authenticated');
