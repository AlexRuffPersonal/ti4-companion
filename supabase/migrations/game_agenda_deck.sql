CREATE TABLE public.game_agenda_deck (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID    NOT NULL,
  agenda_id     UUID    NOT NULL,
  deck_position INTEGER,
  state         TEXT    NOT NULL DEFAULT 'deck'
    CONSTRAINT game_agenda_deck_state_check
    CHECK (state IN ('deck','voting','enacted','repealed','discarded'))
);

ALTER TABLE public.game_agenda_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_agenda_deck_select" ON public.game_agenda_deck FOR SELECT USING (auth.role() = 'authenticated');
