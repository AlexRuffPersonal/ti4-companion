-- Track the active player during the action phase.
-- Set by game-end-turn and game-player-pass; cleared by game-advance-phase.
-- null = no active player (strategy/status phase, or action phase complete).
ALTER TABLE public.games
  ADD COLUMN active_player_id UUID REFERENCES public.game_players(id);

-- Support deck ordering for public objectives so game-shuffle-deck and
-- game-reveal-objective work the same way as other deck tables.
-- game-start populates these rows when a game begins.
ALTER TABLE public.game_public_objectives
  ADD COLUMN deck_position INTEGER,
  ADD COLUMN state TEXT NOT NULL DEFAULT 'deck';
