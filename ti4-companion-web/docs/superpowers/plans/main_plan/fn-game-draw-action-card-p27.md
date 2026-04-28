# fn-game-draw-action-card-p27
**File:** `supabase/functions/game-draw-action-card/index.ts`
**Status:** Modify
**Prereqs:** migration-040-draw-action-card-fn

## Changes

Replace the existing multi-query handler with a single RPC call:

```pseudocode
CORS
AUTH
BODY(game_id: string)

result = await db.rpc('draw_action_card', { p_game_id: game_id, p_user_id: userId })
if result.error:
  if result.error.message includes 'player_not_found': ERR('Player not found in this game', 404)
  if result.error.message includes 'deck_empty':       ERR('Action card deck is empty', 409)
  ERR('Database error', 500)

OK({ drawn: true })
```

All four prior queries (player fetch, card fetch, card update, player update) are removed; the Postgres function handles them atomically.

## Tests

```pseudocode
STD_MOCKS

T401
TCORS
T400(game_id)

it('200 draws card successfully')
  mock db.rpc resolves { data: { drawn: true }, error: null }
  expect response 200 { drawn: true }

it('404 player not in game')
  mock db.rpc resolves { data: null, error: { message: 'player_not_found' } }
  expect response 404

it('409 deck empty')
  mock db.rpc resolves { data: null, error: { message: 'deck_empty' } }
  expect response 409

it('500 on unexpected db error')
  mock db.rpc resolves { data: null, error: { message: 'unexpected' } }
  expect response 500
```
