-- player_id is null for cards returned to the deck (state = 'deck').
-- The NOT NULL constraint incorrectly blocked the discard operation.
ALTER TABLE public.game_player_secret_objectives ALTER COLUMN player_id DROP NOT NULL;
