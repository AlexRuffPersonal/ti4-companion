CREATE TABLE public.games (
  id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                                TEXT        UNIQUE NOT NULL,
  host_user_id                        UUID        NOT NULL,
  phase                               TEXT        NOT NULL DEFAULT 'strategy',
  round                               INTEGER     NOT NULL DEFAULT 1,
  vp_goal                             INTEGER     NOT NULL DEFAULT 10,
  speaker_player_id                   UUID,
  custodians_claimed                  BOOLEAN     NOT NULL DEFAULT false,
  agenda_unlocked                     BOOLEAN     NOT NULL DEFAULT false,
  permissions_mode                    TEXT        NOT NULL DEFAULT 'host',
  expansions                          JSONB       NOT NULL DEFAULT '{"base":true,"pok":true,"te":true}',
  galactic_event                      TEXT,
  map_layout                          TEXT        NOT NULL DEFAULT 'standard-6',
  map_tiles                           JSONB       NOT NULL DEFAULT '{}',
  the_fracture_in_play                BOOLEAN     NOT NULL DEFAULT false,
  status                              TEXT        NOT NULL DEFAULT 'active',
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at                            TIMESTAMPTZ,
  active_player_id                    UUID,
  agenda_phase_step                   TEXT        NOT NULL DEFAULT 'inactive'
    CHECK (agenda_phase_step IN ('inactive','agenda_1_voting','agenda_1_resolved','agenda_2_voting','done')),
  agenda_current_card_id              UUID,
  agenda_vote_current_player_id       UUID,
  current_vote_sequence               INTEGER     NOT NULL DEFAULT 0,
  political_secret_blocked_player_id  UUID,
  wormhole_nexus_active               BOOLEAN     NOT NULL DEFAULT false,
  movement_blocked_systems            TEXT[]      NOT NULL DEFAULT '{}',
  pending_action_window               JSONB,
  draft_state                         JSONB,
  game_round_flags                    JSONB       NOT NULL DEFAULT '{}'
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_select" ON public.games FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "games_insert" ON public.games FOR INSERT WITH CHECK (auth.uid() = host_user_id);
