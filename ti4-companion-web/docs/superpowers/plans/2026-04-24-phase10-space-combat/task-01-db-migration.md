# Task 01: DB Migration

**Files:**
- Create: `supabase/migrations/007_combat.sql`

---

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/007_combat.sql` with the following content:

```sql
-- Add Sustain Damage tracking to units
ALTER TABLE game_player_units ADD COLUMN damaged BOOLEAN NOT NULL DEFAULT false;

-- Combat state per activated system
CREATE TABLE game_combats (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL REFERENCES games(id),
  system_key            TEXT    NOT NULL,
  attacker_player_id    UUID    NOT NULL REFERENCES game_players(id),
  defender_player_id    UUID    NOT NULL REFERENCES game_players(id),
  round                 INTEGER NOT NULL DEFAULT 1,
  phase                 TEXT    NOT NULL DEFAULT 'space_cannon',
  space_cannon_pending  JSONB,
  attacker_dice         JSONB,
  defender_dice         JSONB,
  attacker_hits         INTEGER NOT NULL DEFAULT 0,
  defender_hits         INTEGER NOT NULL DEFAULT 0,
  retreat_declared_by   UUID    REFERENCES game_players(id),
  retreat_destination   TEXT,
  status                TEXT    NOT NULL DEFAULT 'active',
  winner_player_id      UUID    REFERENCES game_players(id),
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Non-activation command tokens placed in systems (retreat CCs)
CREATE TABLE game_system_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES games(id),
  system_key  TEXT NOT NULL,
  player_id   UUID NOT NULL REFERENCES game_players(id),
  token_type  TEXT NOT NULL DEFAULT 'retreat_cc',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE game_combats ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_system_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_combats_game_members" ON game_combats
  FOR ALL TO authenticated
  USING (
    game_id IN (SELECT game_id FROM game_players WHERE user_id = auth.uid())
  );

CREATE POLICY "game_system_tokens_game_members" ON game_system_tokens
  FOR ALL TO authenticated
  USING (
    game_id IN (SELECT game_id FROM game_players WHERE user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: migration runs without error. Verify with:

```bash
supabase db diff
```

Expected: no pending migrations.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_combat.sql
git commit -m "feat: add game_combats and game_system_tokens tables, damaged column"
```
