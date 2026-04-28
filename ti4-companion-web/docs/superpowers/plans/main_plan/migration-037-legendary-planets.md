# migration-037-legendary-planets

**File:** `supabase/migrations/037_legendary_planets.sql`
**Status:** New
**Prereqs:** —

## Functionality

```sql
CREATE TABLE public.game_player_legendary_cards (
  game_id     UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  planet_name TEXT NOT NULL,  -- 'primor' | 'hopes_end' | 'mallice' | 'mirage'
  status      TEXT NOT NULL DEFAULT 'readied',  -- 'readied' | 'exhausted'
  PRIMARY KEY (game_id, planet_name)
);

ALTER TABLE public.games
  ADD COLUMN wormhole_nexus_active BOOLEAN NOT NULL DEFAULT false;
```

Purge = DELETE the row. Transfer = UPDATE player_id (status preserved per LRR 53.2b).

## Tests

No standalone tests — covered by consuming function tests.
