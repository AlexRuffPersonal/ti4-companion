# Migrations Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 53 incremental migration files with one clean SQL file per table, producing a fresh-project-ready schema baseline.

**Architecture:** Each table file has `CREATE TABLE` + indexes + RLS, with zero FK references to other files. All cross-file FK constraints are collected in `zzz_constraints.sql`, which sorts last. `000_bootstrap.sql` handles extensions and the `handle_new_user` trigger.

**Key ordering note:** The `_` character (ASCII 95) sorts before any lowercase letter (ASCII 97+), so all `game_*` files sort BEFORE `games.sql`. Every FK from a `game_*` table to `games` or `profiles` therefore cannot be declared inline and must go in `zzz_constraints.sql`.

**Tech Stack:** PostgreSQL, Supabase migrations (applied alphabetically by filename), plpgsql

---

## File Map

| File | Responsibility |
|------|---------------|
| `000_bootstrap.sql` | Extensions, `handle_new_user` function + trigger |
| `ability_definitions.sql` | Ability DSL definitions |
| `ability_sources.sql` | M2M ability-to-card mapping |
| `action_cards.sql` | Reference: action cards |
| `agendas.sql` | Reference: agenda cards |
| `attachments.sql` | Reference: planet attachments |
| `exploration_cards.sql` | Reference: exploration cards |
| `factions.sql` | Reference: playable factions |
| `game_action_card_deck.sql` | Per-game action card deck rows |
| `game_agenda_deck.sql` | Per-game agenda deck rows |
| `game_agenda_votes.sql` | Player votes per agenda (phase 7 schema) |
| `game_combats.sql` | Active combat state |
| `game_events.sql` | Event log rows |
| `game_exploration_decks.sql` | Per-game exploration deck rows |
| `game_laws.sql` | Enacted laws (phase 7 schema) |
| `game_player_legendary_cards.sql` | Legendary planet ability cards |
| `game_player_planets.sql` | Player-owned planet state |
| `game_player_promissory_notes.sql` | Player promissory note holdings |
| `game_player_secret_objectives.sql` | Player secret objective holdings |
| `game_player_units.sql` | Unit counts per system per player |
| `game_players.sql` | Player rows within a game |
| `game_public_objectives.sql` | Public objectives revealed per game |
| `game_relic_deck.sql` | Per-game relic deck rows |
| `game_rift_transits.sql` | Gravity rift transit state |
| `game_strategy_card_plays.sql` | Strategy card play tracking |
| `game_strategy_card_responses.sql` | Per-player secondary responses |
| `game_system_activations.sql` | Tactic tokens placed on systems |
| `game_system_state.sql` | Per-system state |
| `game_system_tokens.sql` | Retreat CCs and other system tokens |
| `game_transactions.sql` | Trade transactions |
| `game_votes.sql` | Legacy vote rows (phase 3 schema) |
| `games.sql` | Top-level game rows |
| `leaders.sql` | Reference: leader cards |
| `profiles.sql` | User profiles |
| `promissory_notes.sql` | Reference: promissory notes |
| `public_objectives.sql` | Reference: public objectives |
| `relics.sql` | Reference: relic cards |
| `secret_objectives.sql` | Reference: secret objectives |
| `technologies.sql` | Reference: technology cards |
| `tiles.sql` | Reference: map system tiles |
| `units.sql` | Reference: unit type definitions |
| `zzz_constraints.sql` | ALL cross-file FK constraints |
| `zzz_draw_action_card.sql` | `draw_action_card` plpgsql function |
| `zzz_seed_titans.sql` | Titans UL hero ability seed data |

---

### Task 1: `000_bootstrap.sql`

**Files:** Create `supabase/migrations/000_bootstrap.sql`

- [ ] **Step 1: Write the file**

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Auto-create profile on first Supabase Auth sign-in
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/000_bootstrap.sql
git commit -m "refactor(migrations): add 000_bootstrap.sql"
```

---

### Task 2: Reference tables — tiles, factions, agendas, technologies

**Files:** Create four files in `supabase/migrations/`

- [ ] **Step 1: Write `tiles.sql`**

```sql
CREATE TABLE public.tiles (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_number    TEXT    NOT NULL,
  type           TEXT    NOT NULL,
  expansion      TEXT    NOT NULL DEFAULT 'base',
  planets        JSONB   NOT NULL DEFAULT '[]',
  wormholes      TEXT[]  NOT NULL DEFAULT '{}',
  anomalies      TEXT[]  NOT NULL DEFAULT '{}',
  starts_off_board BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiles_select"      ON public.tiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tiles_admin_write" ON public.tiles FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Write `factions.sql`**

```sql
CREATE TABLE public.factions (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT    NOT NULL UNIQUE,
  expansion             TEXT    NOT NULL DEFAULT 'base',
  starting_techs        TEXT[]  NOT NULL DEFAULT '{}',
  commodities           INTEGER NOT NULL DEFAULT 3,
  abilities             JSONB   NOT NULL DEFAULT '[]',
  num_of_starting_techs INTEGER,
  starting_units        JSON    NOT NULL,
  overridden_units      TEXT[]
);

ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "factions_select"      ON public.factions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "factions_admin_write" ON public.factions FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 3: Write `agendas.sql`**

```sql
CREATE TABLE public.agendas (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT    NOT NULL,
  type                        TEXT    NOT NULL,
  outcome                     TEXT    NOT NULL,
  elect_type                  TEXT,
  expansion                   TEXT    NOT NULL DEFAULT 'base',
  effect                      TEXT    NOT NULL,
  reject_effect               TEXT,
  remove_if_expansion_in_play TEXT,
  tractable                   BOOLEAN NOT NULL DEFAULT false,
  effect_json                 JSONB   NOT NULL DEFAULT '{}'
);

ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agendas_select"      ON public.agendas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "agendas_admin_write" ON public.agendas FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 4: Write `technologies.sql`**

```sql
CREATE TABLE public.technologies (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  prerequisites   JSONB   NOT NULL DEFAULT '{}',
  text            TEXT,
  faction         TEXT,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  technology_type TEXT    NOT NULL
);

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "technologies_select"      ON public.technologies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "technologies_admin_write" ON public.technologies FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/tiles.sql supabase/migrations/factions.sql supabase/migrations/agendas.sql supabase/migrations/technologies.sql
git commit -m "refactor(migrations): add reference table files — tiles, factions, agendas, technologies"
```

---

### Task 3: Reference tables — units, public_objectives, secret_objectives, action_cards, relics, exploration_cards, attachments, promissory_notes, leaders

**Files:** Create nine files in `supabase/migrations/`

- [ ] **Step 1: Write `units.sql`**

```sql
CREATE TABLE public.units (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT    NOT NULL UNIQUE,
  cost             NUMERIC,
  combat           TEXT,
  move             INTEGER,
  capacity         INTEGER,
  sustain_damage   BOOLEAN NOT NULL DEFAULT false,
  bombardment      TEXT,
  afb              TEXT,
  space_cannon     TEXT,
  planetary_shield BOOLEAN NOT NULL DEFAULT false,
  unit_type        TEXT,
  production       TEXT,
  abilities        TEXT[]  NOT NULL DEFAULT '{}',
  faction          TEXT,
  ability_text     TEXT,
  effects          JSONB   NOT NULL DEFAULT '[]',
  deploy_trigger   TEXT
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_select"      ON public.units FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "units_admin_write" ON public.units FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Write `public_objectives.sql`**

```sql
CREATE TABLE public.public_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  stage           INTEGER NOT NULL,
  condition       TEXT    NOT NULL,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  condition_check JSONB
);

ALTER TABLE public.public_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_objectives_select"      ON public.public_objectives FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_objectives_admin_write" ON public.public_objectives FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 3: Write `secret_objectives.sql`**

```sql
CREATE TABLE public.secret_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  timing          TEXT,
  condition       TEXT    NOT NULL,
  expansion       TEXT    NOT NULL DEFAULT 'base',
  condition_check JSONB
);

ALTER TABLE public.secret_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secret_objectives_select"      ON public.secret_objectives FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "secret_objectives_admin_write" ON public.secret_objectives FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 4: Write `action_cards.sql`**

```sql
CREATE TABLE public.action_cards (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT    NOT NULL,
  timing    TEXT,
  text      TEXT,
  type      TEXT,
  quantity  INTEGER NOT NULL DEFAULT 1,
  expansion TEXT    NOT NULL DEFAULT 'base',
  ability   JSONB
);

ALTER TABLE public.action_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_cards_select"      ON public.action_cards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "action_cards_admin_write" ON public.action_cards FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 5: Write `relics.sql`**

```sql
CREATE TABLE public.relics (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL,
  text         TEXT,
  exhaustable  BOOLEAN NOT NULL DEFAULT false,
  transferable BOOLEAN NOT NULL DEFAULT true,
  vp_bearing   BOOLEAN NOT NULL DEFAULT false,
  purge_on_use BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.relics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relics_select"      ON public.relics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "relics_admin_write" ON public.relics FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 6: Write `exploration_cards.sql`**

```sql
CREATE TABLE public.exploration_cards (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT    NOT NULL,
  deck_type           TEXT    NOT NULL,
  text                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  relic_fragment_type TEXT,
  has_attachment      BOOLEAN NOT NULL,
  purge               BOOLEAN NOT NULL
);

ALTER TABLE public.exploration_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exploration_cards_select"      ON public.exploration_cards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "exploration_cards_admin_write" ON public.exploration_cards FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 7: Write `attachments.sql`**

```sql
CREATE TABLE public.attachments (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT    NOT NULL,
  tech_specialty     TEXT,
  resource_modifier  INTEGER NOT NULL DEFAULT 0,
  influence_modifier INTEGER NOT NULL DEFAULT 0,
  text               TEXT,
  trait_modifier     TEXT[],
  ability_modifier   JSONB
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_select"      ON public.attachments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attachments_admin_write" ON public.attachments FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 8: Write `promissory_notes.sql`**

```sql
CREATE TABLE public.promissory_notes (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT    NOT NULL,
  faction        TEXT,
  text           TEXT,
  purge_on_use   BOOLEAN NOT NULL DEFAULT false,
  expansion      TEXT    NOT NULL DEFAULT 'base',
  into_play_area BOOLEAN
);

ALTER TABLE public.promissory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promissory_notes_select"      ON public.promissory_notes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promissory_notes_admin_write" ON public.promissory_notes FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 9: Write `leaders.sql`**

```sql
CREATE TABLE public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

ALTER TABLE public.leaders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaders_select" ON public.leaders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "leaders_admin_write" ON public.leaders FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/units.sql supabase/migrations/public_objectives.sql supabase/migrations/secret_objectives.sql supabase/migrations/action_cards.sql supabase/migrations/relics.sql supabase/migrations/exploration_cards.sql supabase/migrations/attachments.sql supabase/migrations/promissory_notes.sql supabase/migrations/leaders.sql
git commit -m "refactor(migrations): add remaining reference table files"
```

---

### Task 4: Ability system tables

**Files:** Create `ability_definitions.sql`, `ability_sources.sql`

- [ ] **Step 1: Write `ability_definitions.sql`**

```sql
CREATE TABLE public.ability_definitions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_key       TEXT    NOT NULL UNIQUE,
  ability_name      TEXT    NOT NULL,
  trigger           JSONB   NOT NULL,
  unlock_conditions JSONB,
  effects           JSONB,
  handler           TEXT,
  exhausts_source   BOOLEAN NOT NULL DEFAULT false,
  purges_source     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT effects_or_handler CHECK (
    (effects IS NOT NULL) != (handler IS NOT NULL)
  )
);

ALTER TABLE public.ability_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ability_definitions_select" ON public.ability_definitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ability_definitions_admin_write" ON public.ability_definitions FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Write `ability_sources.sql`**

Note: `ability_id → ability_definitions` is safe inline because `ability_definitions` sorts before `ability_sources`.

```sql
CREATE TABLE public.ability_sources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_id     UUID NOT NULL REFERENCES public.ability_definitions(id) ON DELETE CASCADE,
  source_type    TEXT NOT NULL CHECK (source_type IN (
    'action_card', 'leader', 'relic', 'faction_ability',
    'promissory_note', 'exploration_card', 'technology', 'strategy_card'
  )),
  source_id         UUID,
  faction_name      TEXT,
  strategy_card_num INTEGER
);

CREATE UNIQUE INDEX ability_sources_by_card
  ON public.ability_sources (ability_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX ability_sources_by_faction
  ON public.ability_sources (ability_id, source_type, faction_name)
  WHERE faction_name IS NOT NULL;

ALTER TABLE public.ability_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ability_sources_select" ON public.ability_sources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ability_sources_admin_write" ON public.ability_sources FOR ALL
  USING      ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/ability_definitions.sql supabase/migrations/ability_sources.sql
git commit -m "refactor(migrations): add ability system table files"
```

---

### Task 5: Core game tables — profiles, games, game_players

**Files:** Create three files. All cross-file FKs omitted here; they go in `zzz_constraints.sql`.

- [ ] **Step 1: Write `profiles.sql`**

```sql
CREATE TABLE public.profiles (
  user_id          UUID        PRIMARY KEY,
  display_name     TEXT,
  preferred_colour TEXT,
  is_admin         BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Write `games.sql`**

All FK columns are included; FK constraints are added in `zzz_constraints.sql`.

```sql
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
```

- [ ] **Step 3: Write `game_players.sql`**

```sql
CREATE TABLE public.game_players (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID        NOT NULL,
  user_id                  UUID,
  display_name             TEXT        NOT NULL,
  faction                  TEXT,
  colour                   TEXT        NOT NULL DEFAULT 'blue',
  seat_index               INTEGER     NOT NULL,
  vp                       INTEGER     NOT NULL DEFAULT 0,
  strategy_card            INTEGER,
  strategy_card_2          INTEGER,
  passed                   BOOLEAN     NOT NULL DEFAULT false,
  command_tokens           JSONB       NOT NULL DEFAULT '{"tactic_total":3,"fleet":3,"strategy":2}',
  tokens_lost_to_mahact    INTEGER     NOT NULL DEFAULT 0,
  tokens_captured_from     JSONB       NOT NULL DEFAULT '{}',
  commodities              INTEGER     NOT NULL DEFAULT 3,
  trade_goods              INTEGER     NOT NULL DEFAULT 0,
  relic_fragments          JSONB       NOT NULL DEFAULT '{"cultural":0,"industrial":0,"hazardous":0,"frontier":0}',
  technologies             TEXT[]      NOT NULL DEFAULT '{}',
  leaders                  JSONB       NOT NULL DEFAULT '{"agent":"unlocked","commander":"locked","hero":"locked"}',
  breakthrough             BOOLEAN     NOT NULL DEFAULT false,
  can_edit_all             BOOLEAN     NOT NULL DEFAULT false,
  action_card_count        INTEGER     NOT NULL DEFAULT 0,
  secrets_selected         BOOLEAN     NOT NULL DEFAULT false,
  tokens_redistributed     BOOLEAN     NOT NULL DEFAULT true,
  secret_objective_count   INTEGER     NOT NULL DEFAULT 0,
  vote_prevented           BOOLEAN     NOT NULL DEFAULT false,
  production_bonus         INTEGER     NOT NULL DEFAULT 0,
  eliminated               BOOLEAN     NOT NULL DEFAULT false,
  is_bot                   BOOLEAN     NOT NULL DEFAULT false,
  bot_strategy             TEXT        CHECK (bot_strategy IN ('random', 'scripted')),
  exhausted_technologies   TEXT[]      NOT NULL DEFAULT '{}',
  second_action_available  BOOLEAN     NOT NULL DEFAULT false,
  minister_of_war_unlocked BOOLEAN     NOT NULL DEFAULT false,
  commander_flags          JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT max_command_tokens CHECK (
    (command_tokens->>'tactic_total')::int +
    (command_tokens->>'fleet')::int +
    (command_tokens->>'strategy')::int <= 16
  ),
  UNIQUE (game_id, seat_index)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_players_select" ON public.game_players FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_players_update" ON public.game_players FOR UPDATE USING (
  auth.uid() = user_id OR
  (SELECT can_edit_all FROM public.game_players gp2
   WHERE gp2.user_id = auth.uid() AND gp2.game_id = game_players.game_id LIMIT 1)
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/profiles.sql supabase/migrations/games.sql supabase/migrations/game_players.sql
git commit -m "refactor(migrations): add profiles, games, game_players table files"
```

---

### Task 6: Agenda tables — game_agenda_deck, game_agenda_votes, game_laws, game_votes

- [ ] **Step 1: Write `game_agenda_deck.sql`**

```sql
CREATE TABLE public.game_agenda_deck (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID    NOT NULL,
  agenda_id     UUID    NOT NULL,
  deck_position INTEGER,
  state         TEXT    NOT NULL DEFAULT 'deck'
    CONSTRAINT game_agenda_deck_state_check
    CHECK (state IN ('deck','voting','enacted','repealed','discarded'))
);

ALTER TABLE public.game_agenda_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_agenda_deck_select" ON public.game_agenda_deck FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_agenda_votes.sql`**

```sql
CREATE TABLE public.game_agenda_votes (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID    NOT NULL,
  game_player_id UUID    NOT NULL,
  agenda_id      UUID    NOT NULL,
  choice         TEXT,
  vote_count     INTEGER NOT NULL DEFAULT 0,
  abstained      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, game_player_id, agenda_id)
);

ALTER TABLE public.game_agenda_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_agenda_votes_select" ON public.game_agenda_votes FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Write `game_laws.sql`**

Note: Uses the phase 7 schema (supersedes the phase 1 schema).

```sql
CREATE TABLE public.game_laws (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL,
  agenda_id             UUID    NOT NULL,
  round_enacted         INTEGER NOT NULL,
  elected_target        TEXT,
  is_repealed           BOOLEAN NOT NULL DEFAULT false,
  host_applies_manually BOOLEAN NOT NULL DEFAULT false,
  elected_planet_name   TEXT
);

CREATE INDEX idx_game_laws_game_active ON public.game_laws (game_id, is_repealed);

ALTER TABLE public.game_laws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_laws_select" ON public.game_laws FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 4: Write `game_votes.sql`**

```sql
CREATE TABLE public.game_votes (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID    NOT NULL,
  agenda_id  UUID    NOT NULL,
  player_id  UUID    NOT NULL,
  round      INTEGER NOT NULL,
  choice     TEXT    NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, agenda_id, player_id, round)
);

ALTER TABLE public.game_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_votes_select" ON public.game_votes FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/game_agenda_deck.sql supabase/migrations/game_agenda_votes.sql supabase/migrations/game_laws.sql supabase/migrations/game_votes.sql
git commit -m "refactor(migrations): add agenda table files"
```

---

### Task 7: Deck and objective tables

- [ ] **Step 1: Write `game_action_card_deck.sql`**

```sql
CREATE TABLE public.game_action_card_deck (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  action_card_id    UUID    NOT NULL,
  copy_index        INTEGER NOT NULL DEFAULT 0,
  deck_position     INTEGER,
  state             TEXT    NOT NULL DEFAULT 'deck',
  held_by_player_id UUID
);

ALTER TABLE public.game_action_card_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_action_card_deck_select" ON public.game_action_card_deck FOR SELECT USING (
  state != 'held'
  OR held_by_player_id IN (
    SELECT id FROM public.game_players
    WHERE game_id = game_action_card_deck.game_id
      AND user_id = auth.uid()
  )
);
```

- [ ] **Step 2: Write `game_relic_deck.sql`**

```sql
CREATE TABLE public.game_relic_deck (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  relic_id          UUID    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'deck',
  held_by_player_id UUID,
  deck_position     INTEGER,
  exhausted         BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.game_relic_deck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_relic_deck_select" ON public.game_relic_deck FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Write `game_exploration_decks.sql`**

```sql
CREATE TABLE public.game_exploration_decks (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID    NOT NULL,
  card_id               UUID    NOT NULL,
  deck_type             TEXT    NOT NULL,
  deck_position         INTEGER,
  state                 TEXT    NOT NULL DEFAULT 'deck',
  resolved_by_player_id UUID,
  system_key            TEXT
);

ALTER TABLE public.game_exploration_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_exploration_decks_select" ON public.game_exploration_decks FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 4: Write `game_public_objectives.sql`**

```sql
CREATE TABLE public.game_public_objectives (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID    NOT NULL,
  objective_id     UUID    NOT NULL,
  revealed_at_round INTEGER,
  scored_by        UUID[]  NOT NULL DEFAULT '{}',
  deck_position    INTEGER,
  state            TEXT    NOT NULL DEFAULT 'deck'
);

ALTER TABLE public.game_public_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_public_objectives_select" ON public.game_public_objectives FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/game_action_card_deck.sql supabase/migrations/game_relic_deck.sql supabase/migrations/game_exploration_decks.sql supabase/migrations/game_public_objectives.sql
git commit -m "refactor(migrations): add deck and objective table files"
```

---

### Task 8: Player card tables — promissory notes, secret objectives

- [ ] **Step 1: Write `game_player_promissory_notes.sql`**

```sql
CREATE TABLE public.game_player_promissory_notes (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID    NOT NULL,
  note_id           UUID    NOT NULL,
  origin_player_id  UUID    NOT NULL,
  held_by_player_id UUID    NOT NULL,
  state             TEXT    NOT NULL DEFAULT 'held'
    CONSTRAINT game_player_promissory_notes_state_check
    CHECK (state IN ('held', 'in_play')),
  metadata          JSONB
);

ALTER TABLE public.game_player_promissory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_promissory_notes_select" ON public.game_player_promissory_notes FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_player_secret_objectives.sql`**

```sql
CREATE TABLE public.game_player_secret_objectives (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID    NOT NULL,
  player_id       UUID    NOT NULL,
  objective_id    UUID    NOT NULL,
  state           TEXT    NOT NULL DEFAULT 'held',
  scored_at_round INTEGER,
  deck_position   INTEGER
);

ALTER TABLE public.game_player_secret_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_secret_objectives_select" ON public.game_player_secret_objectives FOR SELECT USING (
  player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/game_player_promissory_notes.sql supabase/migrations/game_player_secret_objectives.sql
git commit -m "refactor(migrations): add player card table files"
```

---

### Task 9: System and map tables

- [ ] **Step 1: Write `game_system_state.sql`**

```sql
CREATE TABLE public.game_system_state (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID    NOT NULL,
  system_key       TEXT    NOT NULL,
  tile_id          UUID,
  frontier_explored BOOLEAN NOT NULL DEFAULT false,
  has_space_station BOOLEAN NOT NULL DEFAULT false,
  entropic_scar    BOOLEAN NOT NULL DEFAULT false,
  wormhole_active  BOOLEAN NOT NULL DEFAULT true,
  ion_storm        BOOLEAN NOT NULL DEFAULT false,
  mirage_present   BOOLEAN NOT NULL DEFAULT false,
  space_mines      JSONB   NOT NULL DEFAULT '[]',
  combat_active    BOOLEAN NOT NULL DEFAULT false,
  has_mirage       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, system_key)
);

ALTER TABLE public.game_system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_state_select" ON public.game_system_state FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_system_activations.sql`**

```sql
CREATE TABLE public.game_system_activations (
  id                                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                           UUID    NOT NULL,
  player_id                         UUID    NOT NULL,
  system_key                        TEXT    NOT NULL,
  round                             INTEGER NOT NULL,
  token_owner_id                    UUID,
  bombardment_done                  BOOLEAN NOT NULL DEFAULT false,
  movement_blocked_player_id        UUID,
  faction_abilities_blocked_player_id UUID,
  gravity_rift_immune_player_id     UUID,
  UNIQUE (game_id, player_id, system_key, round)
);

ALTER TABLE public.game_system_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_activations_select" ON public.game_system_activations FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Write `game_system_tokens.sql`**

```sql
CREATE TABLE public.game_system_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL,
  system_key TEXT        NOT NULL,
  player_id  UUID        NOT NULL,
  token_type TEXT        NOT NULL DEFAULT 'retreat_cc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX game_system_tokens_game_id ON public.game_system_tokens (game_id);

ALTER TABLE public.game_system_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_system_tokens_game_members" ON public.game_system_tokens FOR SELECT TO authenticated
  USING (game_id IN (SELECT game_id FROM public.game_players WHERE user_id = auth.uid()));
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/game_system_state.sql supabase/migrations/game_system_activations.sql supabase/migrations/game_system_tokens.sql
git commit -m "refactor(migrations): add system and map table files"
```

---

### Task 10: Player state tables

- [ ] **Step 1: Write `game_player_planets.sql`**

```sql
CREATE TABLE public.game_player_planets (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID    NOT NULL,
  player_id           UUID    NOT NULL,
  planet_name         TEXT    NOT NULL,
  tile_id             UUID,
  exhausted           BOOLEAN NOT NULL DEFAULT false,
  space_dock_unit_id  UUID,
  pds_count           INTEGER NOT NULL DEFAULT 0,
  has_sleeper         BOOLEAN NOT NULL DEFAULT false,
  planet_destroyed    BOOLEAN NOT NULL DEFAULT false,
  attachments         UUID[]  NOT NULL DEFAULT '{}',
  tech_specialty      TEXT,
  influence           INTEGER NOT NULL DEFAULT 0,
  resources           INTEGER NOT NULL DEFAULT 0,
  explored            BOOLEAN NOT NULL DEFAULT false,
  terraform_attached  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, player_id, planet_name)
);

ALTER TABLE public.game_player_planets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_planets_select" ON public.game_player_planets FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_player_units.sql`**

```sql
CREATE TABLE public.game_player_units (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID    NOT NULL,
  player_id        UUID    NOT NULL,
  system_key       TEXT    NOT NULL,
  unit_type_id     UUID    NOT NULL,
  count            INTEGER NOT NULL DEFAULT 0,
  damaged_count    INTEGER NOT NULL DEFAULT 0,
  on_planet        TEXT,
  no_move_this_round BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.game_player_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_units_select" ON public.game_player_units FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Write `game_player_legendary_cards.sql`**

```sql
CREATE TABLE public.game_player_legendary_cards (
  game_id     UUID NOT NULL,
  player_id   UUID NOT NULL,
  planet_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'readied'
    CHECK (status IN ('readied', 'exhausted')),
  PRIMARY KEY (game_id, planet_name)
);

ALTER TABLE public.game_player_legendary_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_player_legendary_cards_select" ON public.game_player_legendary_cards FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/game_player_planets.sql supabase/migrations/game_player_units.sql supabase/migrations/game_player_legendary_cards.sql
git commit -m "refactor(migrations): add player state table files"
```

---

### Task 11: Transaction, event, and rift tables

- [ ] **Step 1: Write `game_transactions.sql`**

```sql
CREATE TABLE public.game_transactions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID        NOT NULL,
  from_player_id           UUID        NOT NULL,
  to_player_id             UUID        NOT NULL,
  items                    JSONB       NOT NULL DEFAULT '{}',
  round                    INTEGER     NOT NULL,
  phase                    TEXT        NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                   TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'rescinded')),
  confirmed_at             TIMESTAMPTZ,
  active_player_id         UUID,
  vote_sequence_at_creation INTEGER
);

ALTER TABLE public.game_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_transactions_select" ON public.game_transactions FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_events.sql`**

```sql
CREATE TABLE public.game_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID        NOT NULL,
  player_id  UUID,
  event_type TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  round      INTEGER     NOT NULL,
  phase      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at  TIMESTAMPTZ,
  undo_of    UUID
);

ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_events_select" ON public.game_events FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Write `game_rift_transits.sql`**

Note: original migration 038 referenced `profiles(id)` which is incorrect (profiles PK is `user_id`). Corrected to `profiles(user_id)` here.

```sql
CREATE TABLE public.game_rift_transits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID        NOT NULL,
  system_key      TEXT        NOT NULL,
  destination_key TEXT        NOT NULL,
  player_id       UUID        NOT NULL,
  ships           JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_rift_transits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_rift_transits_select" ON public.game_rift_transits FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/game_transactions.sql supabase/migrations/game_events.sql supabase/migrations/game_rift_transits.sql
git commit -m "refactor(migrations): add transaction, event, and rift table files"
```

---

### Task 12: Combat table

- [ ] **Step 1: Write `game_combats.sql`**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/game_combats.sql
git commit -m "refactor(migrations): add game_combats table file"
```

---

### Task 13: Strategy card tables

- [ ] **Step 1: Write `game_strategy_card_plays.sql`**

```sql
CREATE TABLE public.game_strategy_card_plays (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID        NOT NULL,
  card_number              INTEGER     NOT NULL,
  played_by_player_id      UUID        NOT NULL,
  round                    INTEGER     NOT NULL,
  status                   TEXT        NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  free_secondary_player_ids UUID[]     NOT NULL DEFAULT '{}'
);

ALTER TABLE public.game_strategy_card_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_strategy_card_plays_select" ON public.game_strategy_card_plays FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Write `game_strategy_card_responses.sql`**

```sql
CREATE TABLE public.game_strategy_card_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id          UUID        NOT NULL,
  player_id        UUID        NOT NULL,
  initiative_order INTEGER     NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  responded_at     TIMESTAMPTZ
);

ALTER TABLE public.game_strategy_card_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_strategy_card_responses_select" ON public.game_strategy_card_responses FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/game_strategy_card_plays.sql supabase/migrations/game_strategy_card_responses.sql
git commit -m "refactor(migrations): add strategy card table files"
```

---

### Task 14: `zzz_constraints.sql` — all FK constraints

**Files:** Create `supabase/migrations/zzz_constraints.sql`

This file runs last (after all tables exist) and adds every cross-file FK constraint.

- [ ] **Step 1: Write the file**

```sql
-- ── profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── games ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.games
  ADD CONSTRAINT fk_games_host_user FOREIGN KEY (host_user_id) REFERENCES public.profiles(user_id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_speaker FOREIGN KEY (speaker_player_id) REFERENCES public.game_players(id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_active_player FOREIGN KEY (active_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_agenda_card FOREIGN KEY (agenda_current_card_id) REFERENCES public.agendas(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_agenda_vote_player FOREIGN KEY (agenda_vote_current_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.games
  ADD CONSTRAINT fk_games_political_secret_player FOREIGN KEY (political_secret_blocked_player_id) REFERENCES public.game_players(id);

-- ── game_players ──────────────────────────────────────────────────────────────
ALTER TABLE public.game_players
  ADD CONSTRAINT fk_game_players_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_players
  ADD CONSTRAINT fk_game_players_user FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- ── game_action_card_deck ─────────────────────────────────────────────────────
ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_card FOREIGN KEY (action_card_id) REFERENCES public.action_cards(id);

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_gacd_player FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_agenda_deck ──────────────────────────────────────────────────────────
ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_gad_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_gad_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_agenda_votes ─────────────────────────────────────────────────────────
ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_player FOREIGN KEY (game_player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_agenda_votes
  ADD CONSTRAINT fk_gav_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_combats ──────────────────────────────────────────────────────────────
ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_attacker FOREIGN KEY (attacker_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_defender FOREIGN KEY (defender_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_retreat FOREIGN KEY (retreat_declared_by) REFERENCES public.game_players(id);

ALTER TABLE public.game_combats
  ADD CONSTRAINT fk_gc_winner FOREIGN KEY (winner_player_id) REFERENCES public.game_players(id);

-- ── game_events ───────────────────────────────────────────────────────────────
ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_events
  ADD CONSTRAINT fk_ge_undo_of FOREIGN KEY (undo_of) REFERENCES public.game_events(id);

-- ── game_exploration_decks ────────────────────────────────────────────────────
ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_card FOREIGN KEY (card_id) REFERENCES public.exploration_cards(id);

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_ged_player FOREIGN KEY (resolved_by_player_id) REFERENCES public.game_players(id);

-- ── game_laws ─────────────────────────────────────────────────────────────────
ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_gl_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_gl_agenda FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

-- ── game_player_legendary_cards ───────────────────────────────────────────────
ALTER TABLE public.game_player_legendary_cards
  ADD CONSTRAINT fk_gplc_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_legendary_cards
  ADD CONSTRAINT fk_gplc_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

-- ── game_player_planets ───────────────────────────────────────────────────────
ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_tile FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_gpp_space_dock FOREIGN KEY (space_dock_unit_id) REFERENCES public.units(id);

-- ── game_player_promissory_notes ──────────────────────────────────────────────
ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_note FOREIGN KEY (note_id) REFERENCES public.promissory_notes(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_origin FOREIGN KEY (origin_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_gppn_holder FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_player_secret_objectives ────────────────────────────────────────────
ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_gpso_objective FOREIGN KEY (objective_id) REFERENCES public.secret_objectives(id);

-- ── game_player_units ─────────────────────────────────────────────────────────
ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_gpu_unit_type FOREIGN KEY (unit_type_id) REFERENCES public.units(id);

-- ── game_public_objectives ────────────────────────────────────────────────────
ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_gpo_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_gpo_objective FOREIGN KEY (objective_id) REFERENCES public.public_objectives(id);

-- ── game_relic_deck ───────────────────────────────────────────────────────────
ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_relic FOREIGN KEY (relic_id) REFERENCES public.relics(id);

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_grd_player FOREIGN KEY (held_by_player_id) REFERENCES public.game_players(id);

-- ── game_rift_transits ────────────────────────────────────────────────────────
ALTER TABLE public.game_rift_transits
  ADD CONSTRAINT fk_grt_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_rift_transits
  ADD CONSTRAINT fk_grt_player FOREIGN KEY (player_id) REFERENCES public.profiles(user_id);

-- ── game_strategy_card_plays ──────────────────────────────────────────────────
ALTER TABLE public.game_strategy_card_plays
  ADD CONSTRAINT fk_gscp_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_strategy_card_plays
  ADD CONSTRAINT fk_gscp_player FOREIGN KEY (played_by_player_id) REFERENCES public.game_players(id);

-- ── game_strategy_card_responses ─────────────────────────────────────────────
ALTER TABLE public.game_strategy_card_responses
  ADD CONSTRAINT fk_gscr_play FOREIGN KEY (play_id) REFERENCES public.game_strategy_card_plays(id) ON DELETE CASCADE;

ALTER TABLE public.game_strategy_card_responses
  ADD CONSTRAINT fk_gscr_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

-- ── game_system_activations ───────────────────────────────────────────────────
ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_activations
  ADD CONSTRAINT fk_gsa_token_owner FOREIGN KEY (token_owner_id) REFERENCES public.game_players(id);

-- ── game_system_state ─────────────────────────────────────────────────────────
ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_gss_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_gss_tile FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

-- ── game_system_tokens ────────────────────────────────────────────────────────
ALTER TABLE public.game_system_tokens
  ADD CONSTRAINT fk_gst_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_system_tokens
  ADD CONSTRAINT fk_gst_player FOREIGN KEY (player_id) REFERENCES public.game_players(id);

-- ── game_transactions ─────────────────────────────────────────────────────────
ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_from FOREIGN KEY (from_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_to FOREIGN KEY (to_player_id) REFERENCES public.game_players(id);

ALTER TABLE public.game_transactions
  ADD CONSTRAINT fk_gt_active_player FOREIGN KEY (active_player_id) REFERENCES public.game_players(id);

-- ── game_votes ────────────────────────────────────────────────────────────────
ALTER TABLE public.game_votes
  ADD CONSTRAINT fk_gv_game FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.game_votes
  ADD CONSTRAINT fk_gv_player FOREIGN KEY (player_id) REFERENCES public.game_players(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/zzz_constraints.sql
git commit -m "refactor(migrations): add zzz_constraints.sql with all cross-file FK constraints"
```

---

### Task 15: DB function and seed data

- [ ] **Step 1: Write `zzz_draw_action_card.sql`**

```sql
CREATE OR REPLACE FUNCTION draw_action_card(p_game_id uuid, p_user_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_player_id uuid;
  v_card_count int;
  v_card_id uuid;
BEGIN
  SELECT id, action_card_count INTO v_player_id, v_card_count
  FROM game_players
  WHERE game_id = p_game_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  SELECT id INTO v_card_id
  FROM game_action_card_deck
  WHERE game_id = p_game_id AND state = 'deck'
  ORDER BY deck_position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'deck_empty';
  END IF;

  UPDATE game_action_card_deck
  SET state = 'held', held_by_player_id = v_player_id, deck_position = NULL
  WHERE id = v_card_id;

  UPDATE game_players
  SET action_card_count = v_card_count + 1
  WHERE id = v_player_id;

  RETURN json_build_object('drawn', true);
END;
$$;
```

- [ ] **Step 2: Write `zzz_seed_titans.sql`**

```sql
INSERT INTO ability_definitions (ability_key, ability_name, trigger, handler, exhausts_source, purges_source)
VALUES (
  'ul_progenitor_hero',
  'Ul The Progenitor',
  '{"timing":"action"}',
  'ul_progenitor_hero',
  false,
  false
);

INSERT INTO ability_sources (ability_id, source_type, source_id)
SELECT d.id, 'leader', l.id
FROM ability_definitions d, leaders l
WHERE d.ability_key = 'ul_progenitor_hero'
  AND l.name = 'Ul The Progenitor';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/zzz_draw_action_card.sql supabase/migrations/zzz_seed_titans.sql
git commit -m "refactor(migrations): add zzz_draw_action_card and zzz_seed_titans"
```

---

### Task 16: Delete old migration files

- [ ] **Step 1: Delete all 53 original migration files**

```bash
git rm supabase/migrations/001_core.sql
git rm supabase/migrations/002_system.sql
git rm supabase/migrations/003_agenda.sql
git rm supabase/migrations/004_gameplay.sql
git rm supabase/migrations/005_reference.sql
git rm supabase/migrations/006_rls.sql
git rm supabase/migrations/007_phase3.sql
git rm supabase/migrations/008_phase4a.sql
git rm supabase/migrations/009_phase4b.sql
git rm supabase/migrations/010_tiles_schema_update.sql
git rm supabase/migrations/011_agendas_schema_update.sql
git rm supabase/migrations/012_attachments_schema_update.sql
git rm supabase/migrations/013_exploration_cards_schema_update.sql
git rm supabase/migrations/014_factions_schema_update.sql
git rm supabase/migrations/015_promissory_notes_schema_update.sql
git rm supabase/migrations/016_public_objectives_schema_update.sql
git rm supabase/migrations/017_secret_objectives_schema_update.sql
git rm supabase/migrations/018_technologies_schema_update.sql
git rm supabase/migrations/019_technologies_drop_colour_column.sql
git rm supabase/migrations/020_units_schema_update.sql
git rm supabase/migrations/021_promissory_notes_drop_returns_to_owner.sql
git rm supabase/migrations/022_attachments_add_modifier_columns.sql
git rm supabase/migrations/023_ability_system.sql
git rm supabase/migrations/024_phase6.sql
git rm supabase/migrations/025_phase7.sql
git rm supabase/migrations/026_phase8.sql
git rm supabase/migrations/027_combat.sql
git rm supabase/migrations/028_ground_combat.sql
git rm supabase/migrations/029_strategy_production.sql
git rm supabase/migrations/030_afb.sql
git rm supabase/migrations/031_invasion.sql
git rm supabase/migrations/032_promissory_effects.sql
git rm supabase/migrations/033_leaders.sql
git rm supabase/migrations/034_exploration.sql
git rm supabase/migrations/035_ability_dsl_completions.sql
git rm supabase/migrations/036_combat_action_cards.sql
git rm supabase/migrations/037_legendary_planets.sql
git rm supabase/migrations/038_gravity_rift.sql
git rm supabase/migrations/039_elimination.sql
git rm supabase/migrations/040_draw_action_card_fn.sql
git rm supabase/migrations/041_action_card_effects.sql
git rm supabase/migrations/042_action_window.sql
git rm supabase/migrations/043_tech_effects.sql
git rm supabase/migrations/044_bot_players.sql
git rm supabase/migrations/045_event_log.sql
git rm supabase/migrations/046_objective_conditions.sql
git rm supabase/migrations/047_strategy_card_effects.sql
git rm supabase/migrations/048_draft_state.sql
git rm supabase/migrations/049_law_enforcement.sql
git rm supabase/migrations/050_mech_abilities.sql
git rm supabase/migrations/051_exploration_fixes.sql
git rm supabase/migrations/052_leader_abilities.sql
git rm "supabase/migrations/053_titans_ul_attachments.sql"
git rm "supabase/migrations/053_promissory_dsl.sql"
```

- [ ] **Step 2: Commit the deletion**

```bash
git commit -m "refactor(migrations): delete all 53 original migration files"
```

---

### Task 17: Smoke test

- [ ] **Step 1: Reset the local Supabase instance against the new files**

Requires Docker and Supabase CLI. Run from the repo root:

```bash
supabase db reset
```

Expected output: no errors; last line should be `Finished supabase db reset` or similar.

If any error appears, read the error message, identify which file it came from, fix the SQL in that file, and re-run `supabase db reset`.

- [ ] **Step 2: Verify table count**

```bash
supabase db diff --schema public 2>/dev/null | grep "^+.*CREATE TABLE" | wc -l
```

Expected: 33 or more tables (the exact count from the inventory).

- [ ] **Step 3: Commit any fixes found during smoke test**

```bash
git add supabase/migrations/
git commit -m "fix(migrations): correct schema errors found during smoke test"
```
