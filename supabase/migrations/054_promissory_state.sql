-- Extend game_player_promissory_notes state CHECK to include 'discarded'
-- Allows purge_on_use code path to write state='discarded'

ALTER TABLE public.game_player_promissory_notes
  DROP CONSTRAINT game_player_promissory_notes_state_check;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play', 'discarded'));
