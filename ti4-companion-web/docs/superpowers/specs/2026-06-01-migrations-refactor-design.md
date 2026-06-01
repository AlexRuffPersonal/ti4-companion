# Migrations Refactor — One File Per Table

## Goals

1. Replace 53 incremental migration files with a clean, readable schema baseline
2. Produce a bootstrap-ready set of files for fresh Supabase project setup
3. No schema changes — final schema must be identical to what the 53 migrations produce

## Approach

- Delete all existing migration files
- Write `000_bootstrap.sql` for cross-boundary setup
- Write one `.sql` file per table, alphabetically named, each fully self-contained
- FKs that reference a table sorting later alphabetically are deferred to `000_bootstrap.sql`

---

## File Structure

```
supabase/migrations/
  000_bootstrap.sql
  ability_sources.sql
  action_cards.sql
  agendas.sql
  attachments.sql
  exploration_cards.sql
  factions.sql
  game_action_card_deck.sql
  game_agenda_deck.sql
  game_combats.sql
  game_events.sql
  game_exploration_decks.sql
  game_laws.sql
  game_player_planets.sql
  game_player_promissory_notes.sql
  game_player_secret_objectives.sql
  game_player_units.sql
  game_players.sql
  game_public_objectives.sql
  game_relic_deck.sql
  game_strategy_card_plays.sql
  game_strategy_card_responses.sql
  game_system_activations.sql
  game_system_state.sql
  game_system_tokens.sql
  game_transactions.sql
  game_votes.sql
  games.sql
  profiles.sql
  promissory_notes.sql
  public_objectives.sql
  relics.sql
  secret_objectives.sql
  technologies.sql
  tiles.sql
  units.sql
  … (any additional tables found during inventory)
```

---

## `000_bootstrap.sql` Contents

1. `SET search_path TO public;`
2. Any required extensions (e.g. `pgcrypto`)
3. `handle_new_user()` PL/pgSQL function and its trigger on `auth.users` (cross-schema, cannot live in `profiles.sql`)
4. All deferred cross-table FK constraints — `ALTER TABLE … ADD CONSTRAINT … DEFERRABLE INITIALLY DEFERRED` — for any FK where the referenced table sorts later alphabetically than the referencing table. Known example: `games.speaker_player_id → game_players` (circular reference)

---

## Table File Convention

Each file, in this exact order:

```sql
-- ── <Table Name> ─────────────────────────────
CREATE TABLE public.<table_name> (
  -- all columns in final state
  -- inline FKs only where referenced table sorts before this file
);

-- Indexes
CREATE INDEX … ON public.<table_name> (…);
CREATE UNIQUE INDEX … ON public.<table_name> (…);

-- RLS
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "…" ON public.<table_name> …;
```

Rules:
- **No `ALTER TABLE` inside table files** — all `ADD COLUMN` / `DROP COLUMN` from incremental migrations are folded into `CREATE TABLE` directly
- **FKs to later-sorting tables go in `000_bootstrap.sql`**, not inline
- **RLS always in the same file** as its table
- **Indexes immediately after** the table definition

---

## Implementation Steps

1. Full inventory pass — read every migration file (001–053), derive the final column state of each table, note all indexes, RLS policies, and cross-table FKs
2. Write `000_bootstrap.sql`
3. Write one file per table (folding in all incremental `ALTER TABLE` changes)
4. Delete all 53 original migration files
5. Smoke-test: `supabase db reset` against a local Supabase instance — verify zero errors
6. Commit

---

## Out of Scope

- No changes to Edge Functions
- No changes to RLS logic — policies transcribed as-is
- No schema changes of any kind
- No changes to the live hosted Supabase project
