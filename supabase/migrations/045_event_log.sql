-- Phase 32: Game Event Log — undo support columns

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS undo_of UUID REFERENCES game_events(id);

-- Active-event queries must filter WHERE undone_at IS NULL
