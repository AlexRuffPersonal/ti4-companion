-- Phase 15: Promissory Note Effects schema additions

-- Update state CHECK: remove 'played', add 'in_play'
UPDATE game_player_promissory_notes SET state = 'in_play' WHERE state = 'played';
ALTER TABLE game_player_promissory_notes DROP CONSTRAINT IF EXISTS game_player_promissory_notes_state_check;
ALTER TABLE game_player_promissory_notes ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play'));

-- Political Secret: track which player is blocked from voting
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS political_secret_blocked_player_id UUID REFERENCES game_players(id);

-- Movement / ability block tracking per activation
ALTER TABLE public.game_system_activations
  ADD COLUMN IF NOT EXISTS movement_blocked_player_id UUID,
  ADD COLUMN IF NOT EXISTS faction_abilities_blocked_player_id UUID,
  ADD COLUMN IF NOT EXISTS gravity_rift_immune_player_id UUID;

-- Combat note effects
ALTER TABLE public.game_combats
  ADD COLUMN IF NOT EXISTS reroll_allowed_player_id UUID,
  ADD COLUMN IF NOT EXISTS extra_die_player_id UUID,
  ADD COLUMN IF NOT EXISTS cavalry_active_player_id UUID,
  ADD COLUMN IF NOT EXISTS cavalry_unit_id UUID,
  ADD COLUMN IF NOT EXISTS tekklar_holder_player_id UUID;
