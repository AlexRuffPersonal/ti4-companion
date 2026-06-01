CREATE TABLE public.game_action_card_deck (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  action_card_id    UUID    NOT NULL,
  copy_index        INTEGER NOT NULL DEFAULT 0,
  deck_position     INTEGER,
  state             TEXT    NOT NULL DEFAULT 'deck',
  held_by_player_id UUID
);

ALTER TABLE public.game_action_card_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_action_card_deck_select" ON public.game_action_card_deck FOR SELECT USING (
  state != 'held'
  OR held_by_player_id IN (
    SELECT id FROM public.game_players
    WHERE game_id = game_action_card_deck.game_id
      AND user_id = auth.uid()
  )
);
