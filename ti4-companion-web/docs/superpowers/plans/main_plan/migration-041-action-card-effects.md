# migration-041-action-card-effects
**File:** `supabase/migrations/041_action_card_effects.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
-- DSL storage on action cards reference table
ALTER TABLE public.action_cards
  ADD COLUMN ability JSONB;
-- null = effect not yet authored; array of DSL ops when authored

-- Signal Jamming / Solar Flare: blocked systems cleared at round end by game-advance-phase
ALTER TABLE public.games
  ADD COLUMN movement_blocked_systems TEXT[] NOT NULL DEFAULT '{}';

-- Blitz: consumed and reset to 0 when game-produce-units runs
ALTER TABLE public.game_players
  ADD COLUMN production_bonus INT NOT NULL DEFAULT 0;

-- Ghost Ship: checked by game-move-ships (Phase 18); reset to false at round end by game-advance-phase
ALTER TABLE public.game_player_units
  ADD COLUMN no_move_this_round BOOLEAN NOT NULL DEFAULT false;
```

RLS: no change — existing policies cover all affected tables.

## Tests

None. Verify: `supabase db push` without error.
