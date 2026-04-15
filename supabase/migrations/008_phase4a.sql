-- Add tech_specialty to game_player_planets.
-- Populated at insert time from tiles.planets JSONB.
-- Null means no tech specialty. Values: 'green' | 'blue' | 'yellow' | 'red'
ALTER TABLE public.game_player_planets
  ADD COLUMN tech_specialty TEXT;
