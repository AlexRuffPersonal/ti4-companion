# migration-038-gravity-rift
**File:** `supabase/migrations/038_gravity_rift.sql`
**Status:** New
**Prereqs:** —

## Changes

```sql
CREATE TABLE game_rift_transits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  system_key      TEXT NOT NULL,
  destination_key TEXT NOT NULL,
  player_id       UUID NOT NULL REFERENCES profiles(id),
  ships           JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

`ships` JSONB element: `{ unit_id, unit_type, roll: null|1–10, destroyed: bool, cargo: [{unit_id, unit_type}] }`

RLS: authenticated users can SELECT rows for their active game. Mutations enforced in Edge Function.

## Tests

None. Verify: `supabase db push` without error.
