# migration-053-titans-ul-attachments

**File:** `supabase/migrations/053_titans_ul_attachments.sql`
**Status:** New
**Prereqs:** —

## Functionality

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

`purges_source = false` — the `ul_progenitor_hero` handler sets `leaders.hero = 'attached'` directly, bypassing the normal purge side-effect in `game-resolve-ability`.

No new tables or columns: `game_player_planets.attachments UUID[]` and the `attachments` reference table (with "Terraform" and "Geoform" rows) already exist.

## Tests

No standalone tests — covered by `fn-game-resolve-ability-p44` handler tests.
