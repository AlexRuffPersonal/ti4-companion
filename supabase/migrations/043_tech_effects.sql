ALTER TABLE game_players
  ADD COLUMN exhausted_technologies TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE game_players
  ADD COLUMN second_action_available BOOLEAN NOT NULL DEFAULT FALSE;
