-- Phase 29b: Action Card Window

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS pending_action_window JSONB;

-- Shape when set:
-- {
--   "type": "when_agenda_revealed" | "after_speaker_votes" | "when_voting_begins" | "after_technology_researched",
--   "eligible_player_ids": ["uuid", "..."],
--   "passed_player_ids": [],
--   "context": {}
-- }
-- null = no window open
