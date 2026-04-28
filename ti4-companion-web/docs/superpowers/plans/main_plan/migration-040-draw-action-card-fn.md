# migration-040-draw-action-card-fn
**File:** `supabase/migrations/040_draw_action_card_fn.sql`
**Status:** New
**Prereqs:** —

## Changes

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

  -- SKIP LOCKED: concurrent draw gets no row rather than blocking or racing
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

RLS: no change — function runs with definer rights; existing RLS on `game_players` and `game_action_card_deck` applies outside the transaction.

## Tests

None. Verify: `supabase db push` without error.
