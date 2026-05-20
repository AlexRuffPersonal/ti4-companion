# Spec Standards

Shorthand tokens used in all spec files. Read this before reading any individual spec.

---

## Edge Function Tokens

| Token | Expands To |
|-------|-----------|
| `CORS` | `if OPTIONS → corsPreflightResponse()` |
| `AUTH` | `userId = await requireAuth(req)` catch AuthError → 401 |
| `BODY(f…)` | parse JSON body; return 400 for each missing/wrong-type field `f` |
| `PLAYER` | select `game_players` where `game_id` + `user_id=userId`; 404 if missing |
| `PLAYER(cols)` | same but select specific columns |
| `GAME(cols)` | select `games` where `id=game_id`; 404 if missing |
| `COMBAT` | select `game_combats` where `id=combat_id` + `game_id`; 404 if missing |
| `OK(x)` | `return okResponse(x)` |
| `ERR(msg,n)` | `return errorResponse(msg, n)` |

## Edge Function Sub-Patterns

| Token | Expands To |
|-------|-----------|
| `ROLL_DICE(units, defMap)` | `parseStat(def.combat)` per unit type; roll `count × dice` d10s; hit if `roll >= value`; return `{ results: DieResult[], hits: number }` |
| `APPLY_CASUALTIES(casualties, unitMap, defMap)` | validate sustain eligibility; apply sustain (`damaged=true`); batch destroy (decrement count or delete row) |
| `CLAIM_PLANET(gameId, playerId, planetName, tileId)` | upsert `game_player_planets` `{game_id, player_id, planet_name, tile_id, exhausted:true}` onConflict `game_id,planet_name`; delete prior owner's row |
| `CUSTODIANS(gameId, playerId, systemKey, game)` | if `systemKey==='0,0'` and `!game.custodians_claimed`: update games `{custodians_claimed:true, agenda_unlocked:true}`; increment player VP by 1 |
| `GRANT_LEGENDARY_CARD(gameId, playerId, planetName)` | Phase 21+. `LEGENDARY_PLANETS = ['primor','hopes_end','mallice','mirage']`. If `planetName NOT IN LEGENDARY_PLANETS`: no-op. Else: fetch existing `game_player_legendary_cards` row for `(gameId, planetName)`; if exists → UPDATE `player_id=playerId` (preserve `status`); else → INSERT `{game_id:gameId, player_id:playerId, planet_name:planetName, status:'readied'}`. If `planetName==='mallice'` → UPDATE `games SET wormhole_nexus_active=true WHERE id=gameId`. |
| `ATTACH_PLANET(gameId, playerId, planetName, attachmentName)` | Phase 44+. SELECT `id` FROM `attachments` WHERE `name=attachmentName` → 409 'Attachment definition not found' if missing. SELECT `id, attachments` FROM `game_player_planets` WHERE `game_id+player_id+planet_name` → 409 'Planet not controlled' if missing. If `attachmentId` already in `planet.attachments` → 409 'Already attached'. UPDATE `game_player_planets SET attachments=array_append(attachments, attachmentId)` WHERE `id=planet.id`. |

## Test Tokens

| Token | Expands To |
|-------|-----------|
| `STD_MOCKS` | `vi.mock` auth.ts + db.ts; import handler; define constants `USER_ID, GAME_ID, PLAYER_ID` |
| `REQ(body)` | `new Request(url, {method:'POST', headers:{…}, body:JSON.stringify(body)})` |
| `T401` | `it('401 unauthenticated')` — `requireAuth.mockRejectedValue(new AuthError(…))` |
| `T400(f)` | `it('400 missing/invalid {f}')` — omit or wrong-type that field |
| `T404_PLAYER` | `it('404 player not in game')` — mock player query returns null |
| `T404_COMBAT` | `it('404 combat not found')` — mock combat query returns null |
| `T409(msg)` | `it('409 {msg}')` — mock conditions that trigger that 409 |
| `TCORS` | `it('204 CORS preflight')` — send OPTIONS request |

## Common Test Setup Pattern

```js
// Every function test file follows this pattern:
vi.mock('path/to/auth.ts', () => { class AuthError…; return { requireAuth: vi.fn(), AuthError } })
vi.mock('path/to/db.ts', () => ({ db: { from: vi.fn() } }))
// imports after mocks
// mockDb() helper builds the db.from chain for that function's queries
// beforeEach: vi.clearAllMocks(); mockDb(); requireAuth.mockResolvedValue(USER_ID)
```

## Client Wrapper Pattern

```js
// edgeFunctions.js export:
export const fnName = (arg1, arg2) => callFunction('function-name', { field1: arg1, field2: arg2 })
```

## Hook Dispatcher Pattern

```js
// useSomeHook return value addition:
dispatcherName: (arg) => importedFn(gameId, arg),
```

## Additional Edge Function Tokens

| Token | Expands To |
|-------|-----------|
| `ACTIVE_PLAYER` | ERR 409 if `game.active_player_id !== player.id` |
| `ACTIVATION(systemKey)` | query `game_system_activations` where `game_id + player_id + system_key + round=game.round`; ERR 409 'System not activated' if none |
| `TILE_ID(systemKey, game)` | `tileRef = game.map_tiles[systemKey]`; ERR 409 'System not in map' if missing |
| `TILE(tileId)` | select `tiles` where `id=tileId`; ERR 404 if missing |
| `PLANET_EXISTS(name, tile)` | ERR 409 'Planet not found in system' if `tile.planets` has no entry with `name` |
| `PARSE_STAT(text)` | regex extract `value` from leading digits and `dice` from `(xN)`; defaults: value=6, dice=1 |

| `STRATEGY_PLAY` | select `game_strategy_card_plays` where `game_id` and `status='active'`; 404 if missing |
| `NEXT_RESPONDER(playId)` | select min-`initiative_order` response row where `play_id` + `status='pending'`; ERR 409 'Not your turn' if caller is not that player |

## Additional Test Tokens

| Token | Expands To |
|-------|-----------|
| `T404_GAME` | `it('404 game not found')` — mock game query returns null |
| `T409_ACTIVE` | `it('409 not the active player')` — mock `game.active_player_id` to differ from player |
| `T409_ACTIVATED` | `it('409 system not activated by caller')` — mock activation query returns null |

## UI Patterns

| Token | Expands To |
|-------|-----------|
| `MODAL_WRAPPER` | `<div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">` |
| `PANEL(size)` | `<div className="panel w-full max-w-{size} flex flex-col gap-4">` — size is Tailwind width e.g. `md`, `lg` |
| `LABEL(text)` | `<p className="label">{text}</p>` |
| `MUTED(text)` | `<p className="text-muted text-xs">{text}</p>` |

## Deploy Pattern

```bash
# Always include --no-verify-jwt (project uses ES256 JWTs)
supabase functions deploy <function-name> --no-verify-jwt
```

## Realtime Subscription Pattern

```js
channel = supabase.channel('name')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'table_name', filter: `col=eq.${val}` },
    (payload) => { /* INSERT/UPDATE/DELETE handlers */ })
  .subscribe()
// cleanup: supabase.removeChannel(channel)
```
