-- Phase 39a: Promissory Note DSL Effects
ALTER TABLE public.game_player_promissory_notes
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE public.game_player_planets
  ADD COLUMN IF NOT EXISTS terraform_attached BOOLEAN NOT NULL DEFAULT false;

UPDATE public.promissory_notes
  SET into_play_area = true
  WHERE name = 'Terraform';
