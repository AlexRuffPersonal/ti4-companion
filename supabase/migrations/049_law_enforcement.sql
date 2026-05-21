-- Phase 40: Persistent Agenda Law Enforcement
CREATE INDEX IF NOT EXISTS idx_game_laws_game_active
  ON public.game_laws(game_id, is_repealed);

ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS minister_of_war_unlocked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.game_laws
  ADD COLUMN IF NOT EXISTS elected_planet_name TEXT;
