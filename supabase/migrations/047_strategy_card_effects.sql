ALTER TABLE public.game_strategy_card_plays
  ADD COLUMN free_secondary_player_ids UUID[] NOT NULL DEFAULT '{}';
