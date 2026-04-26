-- Combat state per activated system
CREATE TABLE game_combats (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  system_key            TEXT    NOT NULL,
  attacker_player_id    UUID    NOT NULL REFERENCES game_players(id),
  defender_player_id    UUID    NOT NULL REFERENCES game_players(id),
  round                 INTEGER NOT NULL DEFAULT 1,
  phase                 TEXT    NOT NULL DEFAULT 'space_cannon'
                        CHECK (phase IN ('space_cannon','barrage','attacker_roll','defender_roll','defender_assign','attacker_assign','retreat','complete')),
  space_cannon_pending  JSONB,
  attacker_dice         JSONB,
  defender_dice         JSONB,
  attacker_hits         INTEGER NOT NULL DEFAULT 0,
  defender_hits         INTEGER NOT NULL DEFAULT 0,
  retreat_declared_by   UUID    REFERENCES game_players(id),
  retreat_destination   TEXT,
  status                TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','complete')),
  winner_player_id      UUID    REFERENCES game_players(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX game_combats_active_per_system
  ON game_combats (game_id, system_key)
  WHERE status = 'active';

CREATE INDEX game_combats_game_id ON game_combats (game_id);

-- Non-activation command tokens placed in systems (retreat CCs)
CREATE TABLE game_system_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  system_key  TEXT NOT NULL,
  player_id   UUID NOT NULL REFERENCES game_players(id),
  token_type  TEXT NOT NULL DEFAULT 'retreat_cc',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX game_system_tokens_game_id ON game_system_tokens (game_id);

-- RLS: authenticated users read rows for games they are in
-- Writes are performed by Edge Functions running as service role (bypasses RLS)
ALTER TABLE game_combats ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_system_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_combats_game_members" ON game_combats
  FOR SELECT TO authenticated
  USING (
    game_id IN (SELECT game_id FROM game_players WHERE user_id = auth.uid())
  );

CREATE POLICY "game_system_tokens_game_members" ON game_system_tokens
  FOR SELECT TO authenticated
  USING (
    game_id IN (SELECT game_id FROM game_players WHERE user_id = auth.uid())
  );
