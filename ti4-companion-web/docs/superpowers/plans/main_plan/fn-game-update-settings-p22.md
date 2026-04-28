# fn-game-update-settings (Phase 22)

**File:** `supabase/functions/game-update-settings/index.ts`
**Status:** Modify
**Prereqs:** —

## Changes

```ts
// Extend body type to include map_tiles and map_layout:
let body: {
  game_id?: unknown
  vp_goal?: unknown
  expansions?: unknown
  permissions_mode?: unknown
  map_tiles?: unknown       // NEW
  map_layout?: unknown      // NEW
}

// Existing host + lobby guards unchanged.

// New validation branches (add after existing permissions_mode block):
if (body.map_tiles !== undefined) {
  if (typeof body.map_tiles !== 'object' || body.map_tiles === null || Array.isArray(body.map_tiles))
    return ERR("'map_tiles' must be a non-null object")
  updates.map_tiles = body.map_tiles
}

if (body.map_layout !== undefined) {
  if (typeof body.map_layout !== 'string' || body.map_layout.trim() === '')
    return ERR("'map_layout' must be a non-empty string")
  updates.map_layout = body.map_layout
}
```

## Tests

```js
STD_MOCKS
// existing tests unchanged

// map_tiles
T400('map_tiles is null')         // body.map_tiles = null
T400('map_tiles is array')        // body.map_tiles = []
// host saves valid map_tiles + map_layout → updates.map_tiles and updates.map_layout written
// non-host → 403 (existing guard)
// post-start → 409 (existing guard)
```
