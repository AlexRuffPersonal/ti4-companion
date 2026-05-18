# migration-047-strategy-card-effects
**File:** `supabase/migrations/047_strategy_card_effects.sql`
**Status:** New
**Prereqs:** migration-029-strategy-production

## Changes

```sql
ALTER TABLE public.game_strategy_card_plays
  ADD COLUMN free_secondary_player_ids UUID[] NOT NULL DEFAULT '{}';
```

No ability_definitions seeding needed — strategy card effect logic is handled directly
in `game-play-strategy-card` and `game-use-strategy-secondary` per card_number switch.
