-- Phase 8: Promissory Notes + Trade
ALTER TABLE public.game_transactions
  ADD COLUMN status                   TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'rescinded')),
  ADD COLUMN confirmed_at             TIMESTAMPTZ,
  ADD COLUMN active_player_id         UUID        REFERENCES public.game_players(id),
  ADD COLUMN vote_sequence_at_creation INT;