# migration-051-exploration-fixes
**File:** `supabase/migrations/051_exploration_fixes.sql`
**Status:** New
**Prereqs:** —

## Functionality
```sql
ALTER TABLE public.game_exploration_decks
  ADD COLUMN IF NOT EXISTS system_key TEXT;

ALTER TABLE public.game_system_state
  ADD COLUMN IF NOT EXISTS has_mirage BOOLEAN NOT NULL DEFAULT false;
```

- `system_key`: stored at card draw time so game-resolve-exploration-card knows which system the card came from (needed for place_map_token, freelancers_produce, place_mech_on_current_planet, place_mirage).
- `has_mirage`: signals to the UI that the Mirage planet token should be rendered in this system tile.

## Tests
None — migration verified by full test suite after applying.
