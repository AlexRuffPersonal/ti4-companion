CREATE TABLE public.game_combats (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                   UUID        NOT NULL,
  system_key                TEXT        NOT NULL,
  attacker_player_id        UUID        NOT NULL,
  defender_player_id        UUID        NOT NULL,
  round                     INTEGER     NOT NULL DEFAULT 1,
  phase                     TEXT        NOT NULL DEFAULT 'space_cannon'
    CHECK (phase IN (
      'barrage',
      'afb_attacker_assign', 'afb_defender_assign',
      'attacker_roll', 'defender_roll',
      'attacker_assign', 'defender_assign',
      'bombardment_assign',
      'scd_fire', 'scd_assign',
      'complete'
    )),
  space_cannon_pending      JSONB,
  attacker_dice             JSONB,
  defender_dice             JSONB,
  attacker_hits             INTEGER     NOT NULL DEFAULT 0,
  defender_hits             INTEGER     NOT NULL DEFAULT 0,
  retreat_declared_by       UUID,
  retreat_destination       TEXT,
  status                    TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','complete')),
  winner_player_id          UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  combat_type               TEXT        NOT NULL DEFAULT 'space'
    CHECK (combat_type IN ('space', 'ground', 'bombardment')),
  planet_name               TEXT,
  barrage_attacker_dice     JSONB,
  barrage_defender_dice     JSONB,
  barrage_attacker_hits     INTEGER     NOT NULL DEFAULT 0,
  barrage_defender_hits     INTEGER     NOT NULL DEFAULT 0,
  scd_dice                  JSONB,
  scd_hits                  INTEGER     NOT NULL DEFAULT 0,
  reroll_allowed_player_id  UUID,
  extra_die_player_id       UUID,
  cavalry_active_player_id  UUID,
  cavalry_unit_id           UUID,
  tekklar_holder_player_id  UUID,
  window_passes             JSONB       NOT NULL DEFAULT '{"attacker": false, "defender": false}',
  pending_effects           JSONB       NOT NULL DEFAULT '{}',
  sustained_this_phase      JSONB       NOT NULL DEFAULT '[]',
  destroyed_this_phase      JSONB       NOT NULL DEFAULT '[]',
  ships_moved_in            BOOLEAN     NOT NULL DEFAULT false,
  ships_destroyed           JSONB       NOT NULL DEFAULT '{"attacker":{},"defender":{}}'
);

CREATE UNIQUE INDEX game_combats_active_per_system
  ON public.game_combats (game_id, system_key)
  WHERE status = 'active';

CREATE INDEX game_combats_game_id ON public.game_combats (game_id);

ALTER TABLE public.game_combats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_combats_game_members" ON public.game_combats FOR SELECT TO authenticated
  USING (game_id IN (SELECT game_id FROM public.game_players WHERE user_id = auth.uid()));
