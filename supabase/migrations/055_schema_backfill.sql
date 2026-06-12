-- Backfill columns added to schema files after initial DB creation.
-- Covers 20 missing columns across 4 tables.

-- games: movement, draft, combat, and flag columns
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS political_secret_blocked_player_id UUID,
  ADD COLUMN IF NOT EXISTS wormhole_nexus_active              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS movement_blocked_systems           TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pending_action_window              JSONB,
  ADD COLUMN IF NOT EXISTS draft_state                        JSONB,
  ADD COLUMN IF NOT EXISTS game_round_flags                   JSONB   NOT NULL DEFAULT '{}';

-- game_players: bot, leader, combat, and elimination columns
ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS vote_prevented           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_bonus         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eliminated               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_strategy             TEXT    CHECK (bot_strategy IN ('random', 'scripted')),
  ADD COLUMN IF NOT EXISTS exhausted_technologies   TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS second_action_available  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minister_of_war_unlocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commander_flags          JSONB   NOT NULL DEFAULT '{}';

-- game_system_state: mirage column
ALTER TABLE public.game_system_state
  ADD COLUMN IF NOT EXISTS has_mirage BOOLEAN NOT NULL DEFAULT false;

-- game_system_activations: combat and movement blocking columns
ALTER TABLE public.game_system_activations
  ADD COLUMN IF NOT EXISTS bombardment_done                   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS movement_blocked_player_id         UUID,
  ADD COLUMN IF NOT EXISTS faction_abilities_blocked_player_id UUID,
  ADD COLUMN IF NOT EXISTS gravity_rift_immune_player_id      UUID;
