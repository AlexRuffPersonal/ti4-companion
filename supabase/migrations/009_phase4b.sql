-- Denormalized card count — publicly visible via game_players Realtime subscription.
-- Updated atomically by draw/discard Edge Functions.
ALTER TABLE public.game_players
  ADD COLUMN action_card_count INTEGER NOT NULL DEFAULT 0;

-- RLS: held cards are private to their owner; deck and discard rows are public.
-- Drop the old policy (from 006_rls.sql) before replacing it with state-based logic.
DROP POLICY IF EXISTS "game_action_card_deck_select" ON public.game_action_card_deck;

CREATE POLICY "game_action_card_deck_select" ON public.game_action_card_deck
  FOR SELECT USING (
    state != 'held'
    OR held_by_player_id IN (
      SELECT id FROM public.game_players
      WHERE game_id = game_action_card_deck.game_id
        AND user_id = auth.uid()
    )
  );
