# migration-044-bot-players

**File:** `supabase/migrations/044_bot_players.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
ALTER TABLE game_players
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN bot_strategy TEXT CHECK (bot_strategy IN ('random', 'scripted'));
```

- `user_id` nullable — bots have no auth account
- `is_bot` — distinguishes bot slots from human players
- `bot_strategy` — nullable; only set when `is_bot = true`

## Tests

None. Verify: `supabase db push` without error; existing rows unaffected (user_id remains non-null for all current rows).
