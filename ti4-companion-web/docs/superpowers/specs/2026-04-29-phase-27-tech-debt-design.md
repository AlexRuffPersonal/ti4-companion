# Phase 27 Tech Debt Design

**Date:** 2026-04-29
**Phase:** 27
**Feature area:** Tech Debt

---

## Scope

Two backend fixes with no observable behaviour change for the client:

1. Concurrent draw race in `game-draw-action-card`
2. N+1 queries in `game-start` player initialisation

No other POTENTIAL_TODOS items qualify as tech debt suitable for this phase; everything else is feature work already assigned to a specific phase.

---

## Fix 1: Concurrent draw race (`game-draw-action-card`)

### Problem

The Edge Function reads the top deck card and updates it in two separate queries with no transaction. Two concurrent draws can both read the same top card and both mark it as `held`, producing a duplicate draw.

### Approach: Postgres function with `FOR UPDATE SKIP LOCKED`

**Migration `040_draw_action_card_fn.sql`** adds:

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

`FOR UPDATE` on the player row serialises concurrent draws by the same player. `FOR UPDATE SKIP LOCKED` on the deck means a concurrent transaction skips any card already locked — if only one card remains, the second draw gets no row back and raises `deck_empty` (409), rather than both succeeding with the same card.

**`game-draw-action-card/index.ts`** is replaced with:
- Auth + body validation (unchanged)
- Single `db.rpc('draw_action_card', { p_game_id: body.game_id, p_user_id: userId })` call
- Error mapping: `player_not_found` → 404, `deck_empty` → 409, other DB error → 500

### Tests

- Happy path: draw returns `{ drawn: true }`; card moves to `held`; `action_card_count` increments
- Deck empty: returns 409
- Player not in game: returns 404
- Concurrency: two simultaneous draws on a 1-card deck — exactly one succeeds, the other gets 409

---

## Fix 2: N+1 queries in `game-start`

### Problem

The player initialisation block issues 3–4 sequential DB calls per player (faction lookup → tech update → tile lookup → planet insert), plus a second faction query loop for home tile seeding. With 8 players this is up to ~40 sequential round-trips.

### Approach: Batch reads + `Promise.all` for writes

Restructure the player initialisation section of `game-start/index.ts`:

1. **Single batch faction query** — `.from('factions').select('name, home_tile_number, starting_techs').in('name', players.map(p => p.faction))` → build `Map<factionName, FactionData>`

2. **Single batch tile query** — collect all unique `home_tile_number` values from the faction map, then `.from('tiles').select('tile_number, planets').in('tile_number', homeTileNumbers)` → build `Map<tileNumber, TileData>`

3. **Single bulk planet insert** — iterate players in memory using both maps to build all `game_player_planets` rows; one `.insert(allPlanetRows)` call

4. **Concurrent tech updates** — `await Promise.all(...)` over players with non-empty starting techs; 8 concurrent calls instead of 8 sequential ones

5. **Remove duplicate faction loop** (current lines 323–329) — `homeTileNumbers` is derived from the faction map built in step 1; no second faction query is needed

**Call count:** ~40 sequential → 2 batch reads + 1 bulk insert + up to 8 concurrent updates.

No migration required. No observable behaviour change.

### Tests

- Existing `game-start` tests pass unchanged
- 8-player game: all players receive correct starting techs and home planets via the batch path
- `db.from('factions')` is called exactly once (spy assertion)

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/040_draw_action_card_fn.sql` | New — adds `draw_action_card` Postgres function |
| `supabase/functions/game-draw-action-card/index.ts` | Modify — replace multi-query logic with single `rpc()` call |
| `supabase/functions/game-start/index.ts` | Modify — batch reads, bulk insert, concurrent tech updates, remove duplicate faction loop |
