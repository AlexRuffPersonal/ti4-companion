# migration-034-exploration
**File:** `supabase/migrations/034_exploration.sql`
**Status:** New
**Prereqs:** —

## Functionality
```sql
ALTER TABLE public.game_player_planets
  ADD COLUMN explored BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.game_relic_deck
  ADD COLUMN exhausted BOOLEAN NOT NULL DEFAULT false;
```

- `explored`: gates the "Explore Planet" button; set to true after first exploration of a planet. Planets that cannot be explored (Mecatol Rex, home system planets) remain false and are never shown the explore badge.
- `exhausted`: tracks exhausted state for exhaustable relics (Scepter of Emelpar, Crown of Emphidia, Prophet's Tears). Purged relics are tracked via the existing `state` column (add value `'purged'`).

Relic fragment state reuses `game_exploration_decks.state = 'held'` with `resolved_by_player_id`.
Attachment tracking reuses `game_player_planets.attachments UUID[]`.
Map tokens (gamma wormhole, ion storm) reuse existing `game_system_state` columns.
Mirage planet is inserted as a new `game_player_planets` row (`planet_name = 'Mirage'`).

## Tests
None — migration verified by running the full test suite after applying.
