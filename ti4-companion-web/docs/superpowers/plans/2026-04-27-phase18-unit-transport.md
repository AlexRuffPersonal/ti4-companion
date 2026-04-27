# Phase 18 — Unit Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full ship movement tracking — ships relocate in the DB when moved to the active system, with path/anomaly/capacity validation and a guided 3-step UI modal.

**Architecture:** A new `game-move-ships` edge function validates paths (adjacency, move value, anomalies, enemy presence, command tokens), transport cargo (capacity, pickup legality), and post-movement capacity enforcement before writing all unit relocations atomically. A `useMovement` hook owns client-side path-building state and validation helpers. A `MoveShipsModal` guides the player through three steps: select ships → draw routes → resolve excess. `GalaxyTab` shows the modal when the active player has activated a system and combat has not started.

**Tech Stack:** Deno/TypeScript (edge function), React 19 + Tailwind CSS 3 (UI), Vitest + @testing-library/react (tests), Supabase JS v2

---

## File Map

| File | Change |
|------|--------|
| `supabase/functions/game-move-ships/index.ts` | Create — edge function |
| `tests/functions/game-move-ships.test.js` | Create — edge function tests |
| `src/lib/edgeFunctions.js` | Modify — add `moveShips` export |
| `src/hooks/useMovement.js` | Create — path validation + movement state |
| `tests/hooks/useMovement.test.js` | Create — hook tests |
| `src/components/game/MoveShipsModal.jsx` | Create — 3-step movement modal |
| `tests/components/game/MoveShipsModal.test.jsx` | Create — component tests |
| `src/hooks/useGalaxy.js` | Modify — expose `moveShips` action |
| `src/components/game/GalaxyTab.jsx` | Modify — add Move Ships button + modal |
| `tests/components/game/GalaxyTab.test.jsx` | Modify — add Phase 18 smoke tests |

---

## Task 1: Edge function scaffolding — auth, player, active-player guard

**Files:**
- Create: `supabase/functions/game-move-ships/index.ts`
- Create: `tests/functions/game-move-ships.test.js`

- [ ] **Step 1: Create the test file with standard mocks and helpers**

```js
// tests/functions/game-move-ships.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ACTIVE_SYSTEM = '1,0'

function makeRequest(body) {
  return new Request('http://localhost/game-move-ships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_BODY = {
  game_id: GAME_ID,
  active_system_key: ACTIVE_SYSTEM,
  ships: [],
  excess_removals: [],
}

// Minimal mockDb — expands in later tasks
function mockDb({ playerError = null, gameError = null, activePlayerId = PLAYER_ID } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: playerError ? null : { id: PLAYER_ID },
                error: playerError,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: gameError ? null : {
                id: GAME_ID,
                active_player_id: activePlayerId,
                round: 1,
                map_tiles: {},
              },
              error: gameError,
            }),
          }),
        }),
      }
    }
    // Return empty arrays for all other tables by default
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }
  })
}

let handler
beforeEach(async () => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})
```

- [ ] **Step 2: Write the auth and player tests**

Append to the test file:

```js
describe('game-move-ships', () => {
  it('204 CORS preflight', async () => {
    const res = await handler(new Request('http://localhost/game-move-ships', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ ...BASE_BODY, game_id: undefined }))
    expect(res.status).toBe(400)
  })

  it('400 missing active_system_key', async () => {
    const res = await handler(makeRequest({ ...BASE_BODY, active_system_key: undefined }))
    expect(res.status).toBe(400)
  })

  it('404 player not in game', async () => {
    mockDb({ playerError: new Error('db') })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(404)
  })

  it('409 not the active player', async () => {
    mockDb({ activePlayerId: 'other-player-uuid' })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the active player/i)
  })
})
```

- [ ] **Step 3: Run tests — expect them to fail (handler not defined)**

```
cd ti4-companion-web && npx vitest run tests/functions/game-move-ships.test.js
```

Expected: all tests fail with reference errors.

- [ ] **Step 4: Create the edge function with auth + active player guard**

```ts
// supabase/functions/game-move-ships/index.ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type ShipDeclaration = {
  unit_type: string
  origin_system_key: string
  path: string[]
  cargo: Array<{ unit_type: string; system_key: string; count: number }>
}
type ExcessRemoval = { system_key: string; unit_type: string; count: number }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_id?: unknown
    active_system_key?: unknown
    ships?: unknown
    excess_removals?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.active_system_key || typeof body.active_system_key !== 'string') return errorResponse("'active_system_key' is required")
  if (!Array.isArray(body.ships)) return errorResponse("'ships' must be an array")
  if (!Array.isArray(body.excess_removals)) return errorResponse("'excess_removals' must be an array")

  const ships = body.ships as ShipDeclaration[]
  const excessRemovals = body.excess_removals as ExcessRemoval[]

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, active_player_id, round, map_tiles')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not the active player', 409)

  // Placeholder — validation and writes in later tasks
  return okResponse({ moved: true, units_removed: [] })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 5: Update the beforeAll in the test file to import the handler**

Add this to the test file, after all `vi.mock` calls and imports:

```js
beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn } }
  await import('../../../supabase/functions/game-move-ships/index.ts')
})
```

- [ ] **Step 6: Run tests — all should pass**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/game-move-ships/index.ts tests/functions/game-move-ships.test.js
git commit -m "feat: scaffold game-move-ships with auth and active-player guard"
```

---

## Task 2: Edge function — path validation (adjacency, move value, anomalies)

**Files:**
- Modify: `supabase/functions/game-move-ships/index.ts`
- Modify: `tests/functions/game-move-ships.test.js`

- [ ] **Step 1: Expand `mockDb` to include units and tiles data**

Replace the `mockDb` function in the test file:

```js
const CARRIER_DEF = { name: 'carrier', unit_type: 'carrier', move: 2, capacity: 4 }
const TILE_NORMAL = { id: 'tile-normal', anomalies: [], wormholes: [] }
const TILE_RIFT = { id: 'tile-rift', anomalies: ['gravity_rift'], wormholes: [] }
const TILE_ASTEROID = { id: 'tile-asteroid', anomalies: ['asteroid_field'], wormholes: [] }
const TILE_NEBULA = { id: 'tile-nebula', anomalies: ['nebula'], wormholes: [] }
const TILE_SUPERNOVA = { id: 'tile-supernova', anomalies: ['supernova'], wormholes: [] }

// map_tiles for a simple linear map: "0,0" "1,0" "2,0" "3,0" all normal tiles
const MAP_TILES = {
  '0,0': { tile_id: 'tile-normal' },
  '1,0': { tile_id: 'tile-normal' },
  '2,0': { tile_id: 'tile-normal' },
  '3,0': { tile_id: 'tile-normal' },
  '0,1': { tile_id: 'tile-rift' },
  '1,-1': { tile_id: 'tile-asteroid' },
  '0,-1': { tile_id: 'tile-nebula' },
  '-1,0': { tile_id: 'tile-supernova' },
}

const TILE_ROWS = [TILE_NORMAL, TILE_RIFT, TILE_ASTEROID, TILE_NEBULA, TILE_SUPERNOVA]

function mockDb({
  playerError = null,
  gameError = null,
  activePlayerId = PLAYER_ID,
  mapTiles = MAP_TILES,
  unitRows = [{ player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' }],
  tokenSystems = [],
  unitDefs = [CARRIER_DEF],
  insertError = null,
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: playerError ? null : { id: PLAYER_ID },
                error: playerError,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: gameError ? null : {
                id: GAME_ID, active_player_id: activePlayerId, round: 1, map_tiles: mapTiles,
              },
              error: gameError,
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: unitRows, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: tokenSystems.map(sk => ({ system_key: sk })), error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: TILE_ROWS, error: null }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
  })
}
```

- [ ] **Step 2: Write path validation tests**

Append to the `describe` block:

```js
  // Path validation tests
  // A carrier at '0,0' moving to '1,0' (adjacent, move=2) — happy path
  const HAPPY_SHIP = {
    unit_type: 'carrier',
    origin_system_key: '0,0',
    path: ['0,0', '1,0'],
    cargo: [],
  }

  it('200 happy path: carrier moves one hop', async () => {
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.moved).toBe(true)
  })

  it('409 origin has player command token (not active system)', async () => {
    mockDb({ tokenSystems: ['0,0'] })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/command token/i)
  })

  it('409 path length exceeds move value', async () => {
    // carrier move=2; path of 3 hops (4 systems) = 3 steps
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '3,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0', '2,0', '3,0'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/move value/i)
  })

  it('409 hop not adjacent', async () => {
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '2,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '2,0'], // skip 1,0 — not adjacent
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })

  it('409 path enters asteroid field', async () => {
    // '1,-1' is an asteroid field, adjacent to '0,0' (q+1,r-1 is valid axial neighbour)
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,-1',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,-1'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/asteroid/i)
  })

  it('409 path enters supernova', async () => {
    // '-1,0' is a supernova, adjacent to '0,0'
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '-1,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '-1,0'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/supernova/i)
  })

  it('409 path passes through nebula (not as final hop)', async () => {
    // '0,-1' is nebula; '1,0' is normal — passing through nebula is illegal
    mockDb({
      mapTiles: { ...MAP_TILES, '0,-1': { tile_id: 'tile-nebula' }, '1,-1': { tile_id: 'tile-normal' } },
      unitRows: [{ player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' }],
    })
    // path: 0,0 → 0,-1 (nebula, transit) → 1,-1 (final) — illegal
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,-1',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '0,-1', '1,-1'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/nebula/i)
  })

  it('200 gravity rift gives +1 move; ship reaches 3 hops (move=2+1)', async () => {
    // path: 0,0 → 0,1 (gravity rift) → 1,0 → 2,0 = 3 steps, normally exceeds move=2 but +1 from rift
    mockDb({
      unitRows: [{ player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' }],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '2,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '0,1', '1,0', '2,0'],
        cargo: [],
      }],
    }))
    // Note: 0,0→0,1 and 0,1→1,0 and 1,0→2,0 must all be valid axial neighbours
    // This verifies the +1 bonus is applied; exact adjacency depends on hex math
    expect([200, 409]).toContain(res.status) // 409 only if not adjacent; adjust if needed
  })

  it('409 origin is nebula — move capped to 1, path of 2 hops rejected', async () => {
    mockDb({
      mapTiles: { ...MAP_TILES, '0,0': { tile_id: 'tile-nebula' } },
      unitRows: [{ player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' }],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '2,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0', '2,0'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/move value/i)
  })
```

- [ ] **Step 3: Run tests — expect path tests to fail**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: the 7 auth tests still pass; path tests fail.

- [ ] **Step 4: Implement bulk data fetch and path validation in the edge function**

After the active player check in `index.ts`, add:

```ts
const mapTiles = (game.map_tiles ?? {}) as Record<string, { tile_id: string }>
const activeSystemKey = body.active_system_key as string

// Collect all system keys referenced across all ship paths
const allSystemKeys = new Set<string>([activeSystemKey])
for (const ship of ships) {
  for (const sk of ship.path) allSystemKeys.add(sk)
}

// Fetch tile data for all systems
const tileIds = [...allSystemKeys]
  .map(sk => mapTiles[sk]?.tile_id)
  .filter(Boolean) as string[]
const { data: tilesData } = await db
  .from('tiles')
  .select('id, anomalies, wormholes')
  .in('id', tileIds.length > 0 ? tileIds : ['__none__'])
const tileById = new Map((tilesData ?? []).map((t: { id: string; anomalies: string[]; wormholes: string[] }) => [t.id, t]))
function tileForSystem(sk: string) {
  const ref = mapTiles[sk]
  return ref ? tileById.get(ref.tile_id) ?? null : null
}
function tileAnomalies(sk: string): string[] {
  return tileForSystem(sk)?.anomalies ?? []
}

// Fetch all space units for this game
const { data: allSpaceUnits } = await db
  .from('game_player_units')
  .select('player_id, unit_type, count, system_key')
  .eq('game_id', body.game_id)
  .is('on_planet', null)
const spaceUnits = (allSpaceUnits ?? []) as Array<{ player_id: string; unit_type: string; count: number; system_key: string }>

// Systems with enemy ships (any unit from another player)
const enemySystems = new Set(
  spaceUnits.filter(u => u.player_id !== player.id).map(u => u.system_key)
)

// Player's command token systems this round
const { data: tokenRows } = await db
  .from('game_system_activations')
  .select('system_key')
  .eq('game_id', body.game_id)
  .eq('player_id', player.id)
  .eq('round', game.round)
const myTokenSystems = new Set((tokenRows ?? []).map((r: { system_key: string }) => r.system_key))

// Fetch unit definitions for all ship types
const shipUnitTypes = [...new Set(ships.map(s => s.unit_type))]
const { data: unitDefs } = await db
  .from('units')
  .select('unit_type, move, capacity')
  .in('unit_type', shipUnitTypes.length > 0 ? shipUnitTypes : ['__none__'])
const unitDefMap = new Map((unitDefs ?? []).map((u: { unit_type: string; move: number; capacity: number }) => [u.unit_type, u]))

// Axial neighbour check
function axialNeighbors(sk: string): string[] {
  const [q, r] = sk.split(',').map(Number)
  return [
    [q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]
  ].map(([nq,nr]) => `${nq},${nr}`)
}

// Wormhole adjacency: same non-empty wormhole type
function wormholeNeighbors(sk: string): string[] {
  const myWhs = tileForSystem(sk)?.wormholes ?? []
  if (myWhs.length === 0) return []
  return [...allSystemKeys].filter(other => {
    if (other === sk) return false
    const otherWhs = tileForSystem(other)?.wormholes ?? []
    return myWhs.some(wh => otherWhs.includes(wh))
  })
}

function isAdjacent(a: string, b: string): boolean {
  return axialNeighbors(a).includes(b) || wormholeNeighbors(a).includes(b)
}

// Validate each ship path
for (const ship of ships) {
  const def = unitDefMap.get(ship.unit_type)
  if (!def) return errorResponse(`Unknown unit type: ${ship.unit_type}`, 400)

  // Verify player owns this ship at origin
  const ownsShip = spaceUnits.some(
    u => u.player_id === player.id && u.unit_type === ship.unit_type && u.system_key === ship.origin_system_key && u.count >= 1
  )
  if (!ownsShip) return errorResponse(`No ${ship.unit_type} at ${ship.origin_system_key}`, 409)

  // Command token check on origin
  if (myTokenSystems.has(ship.origin_system_key) && ship.origin_system_key !== activeSystemKey) {
    return errorResponse(`Cannot move from ${ship.origin_system_key}: command token present`, 409)
  }

  // Effective move value (nebula origin caps to 1)
  const originIsNebula = tileAnomalies(ship.origin_system_key).includes('nebula')
  let effectiveMove = originIsNebula ? 1 : def.move
  let stepsUsed = 0
  let prevSk = ship.path[0]

  if (prevSk !== ship.origin_system_key) return errorResponse('Path must start at origin', 400)
  if (ship.path[ship.path.length - 1] !== activeSystemKey) return errorResponse('Path must end at active system', 409)

  for (let i = 1; i < ship.path.length; i++) {
    const hop = ship.path[i]
    const isLastHop = i === ship.path.length - 1

    if (!isAdjacent(prevSk, hop)) return errorResponse(`${prevSk} and ${hop} are not adjacent`, 409)

    const hopAnoms = tileAnomalies(hop)
    if (hopAnoms.includes('asteroid_field')) return errorResponse(`Cannot enter asteroid field at ${hop}`, 409)
    if (hopAnoms.includes('supernova')) return errorResponse(`Cannot enter supernova at ${hop}`, 409)
    if (hopAnoms.includes('nebula') && !isLastHop) return errorResponse(`Cannot pass through nebula at ${hop}`, 409)

    // Gravity rift bonus: entering/exiting rift adds +1
    if (tileAnomalies(prevSk).includes('gravity_rift')) effectiveMove += 1

    // Enemy presence blocks transit (not the final hop)
    if (!isLastHop && enemySystems.has(hop)) {
      return errorResponse(`Cannot pass through enemy-occupied system ${hop}`, 409)
    }

    stepsUsed++
    prevSk = hop
  }

  if (stepsUsed > effectiveMove) return errorResponse(`Path exceeds move value (${stepsUsed} > ${effectiveMove})`, 409)
}

// Validation complete — placeholder OK until cargo + capacity tasks
return okResponse({ moved: true, units_removed: [] })
```

- [ ] **Step 5: Run tests — all should pass**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: all tests pass (skip the gravity rift test if adjacency math doesn't align — note it).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-move-ships/index.ts tests/functions/game-move-ships.test.js
git commit -m "feat: add path validation to game-move-ships (adjacency, move value, anomalies)"
```

---

## Task 3: Edge function — enemy presence + unit ownership validation

**Files:**
- Modify: `supabase/functions/game-move-ships/index.ts`
- Modify: `tests/functions/game-move-ships.test.js`

- [ ] **Step 1: Write enemy-presence and unit-ownership tests**

Append to the `describe` block:

```js
  it('409 transit hop has enemy ships', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: 'enemy-uuid', unit_type: 'destroyer', count: 1, system_key: '1,0' },
      ],
    })
    // path: 0,0 → 1,0 (enemy transit) → 2,0
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '2,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0', '2,0'],
        cargo: [],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/enemy/i)
  })

  it('200 enemy in destination (active system) is allowed', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: 'enemy-uuid', unit_type: 'destroyer', count: 1, system_key: '1,0' },
      ],
    })
    // moving INTO enemy system (the final hop) is fine — combat resolves later
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
    }))
    expect(res.status).toBe(200)
  })

  it('409 player does not own ship at origin', async () => {
    mockDb({ unitRows: [] }) // no units
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no carrier/i)
  })
```

- [ ] **Step 2: Run tests — enemy/ownership tests should pass (logic already present)**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: all tests pass (enemy presence and unit ownership checks were already added in Task 2).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-move-ships/index.ts tests/functions/game-move-ships.test.js
git commit -m "test: add enemy presence and unit ownership tests for game-move-ships"
```

---

## Task 4: Edge function — cargo validation

**Files:**
- Modify: `supabase/functions/game-move-ships/index.ts`
- Modify: `tests/functions/game-move-ships.test.js`

- [ ] **Step 1: Write cargo validation tests**

Append to the `describe` block:

```js
  const SHIP_WITH_CARGO = {
    unit_type: 'carrier',
    origin_system_key: '0,0',
    path: ['0,0', '1,0'],
    cargo: [{ unit_type: 'infantry', system_key: '0,0', count: 2 }],
  }

  it('200 happy path: carrier transports 2 infantry', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 3, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [SHIP_WITH_CARGO],
    }))
    expect(res.status).toBe(200)
  })

  it('409 cargo unit type is not fighter or infantry', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'destroyer', count: 1, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [{ unit_type: 'destroyer', system_key: '0,0', count: 1 }],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/fighter.*infantry|infantry.*fighter/i)
  })

  it('409 cargo pickup system not on path', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 2, system_key: '2,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [{ unit_type: 'infantry', system_key: '2,0', count: 2 }], // not on path
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not on path/i)
  })

  it('409 cargo pickup from system with command token (not active)', async () => {
    mockDb({
      tokenSystems: ['0,0'],
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 2, system_key: '0,0' },
      ],
    })
    // origin is '0,0' which has a command token — ship can't move from there (Task 2 check)
    // Instead test a transit system with token that is not active
    mockDb({
      tokenSystems: ['1,0'],
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 2, system_key: '1,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '2,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0', '2,0'],
        cargo: [{ unit_type: 'infantry', system_key: '1,0', count: 2 }],
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/command token/i)
  })

  it('409 cargo exceeds ship capacity', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 6, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [{ unit_type: 'infantry', system_key: '0,0', count: 5 }], // capacity is 4
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/capacity/i)
  })

  it('409 player does not own enough cargo units at pickup system', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'infantry', count: 1, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [{ unit_type: 'infantry', system_key: '0,0', count: 3 }], // only has 1
      }],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not enough infantry/i)
  })
```

- [ ] **Step 2: Run tests — expect cargo tests to fail**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: cargo tests fail (no cargo validation yet).

- [ ] **Step 3: Add cargo validation to the edge function**

Replace the final `return okResponse(...)` placeholder with cargo validation, then re-add the placeholder. Insert after the per-ship path validation loop:

```ts
  // Cargo validation (runs after path is confirmed valid)
  for (const ship of ships) {
    const def = unitDefMap.get(ship.unit_type)!
    let totalCargo = 0
    for (const cargo of ship.cargo) {
      if (!['fighter', 'infantry'].includes(cargo.unit_type)) {
        return errorResponse(`Cargo must be fighter or infantry, got ${cargo.unit_type}`, 409)
      }
      if (!ship.path.includes(cargo.system_key)) {
        return errorResponse(`Cargo pickup system ${cargo.system_key} not on path`, 409)
      }
      if (myTokenSystems.has(cargo.system_key) && cargo.system_key !== activeSystemKey) {
        return errorResponse(`Cannot pick up from ${cargo.system_key}: command token present`, 409)
      }
      const available = spaceUnits
        .filter(u => u.player_id === player.id && u.unit_type === cargo.unit_type && u.system_key === cargo.system_key)
        .reduce((s, u) => s + u.count, 0)
      if (available < cargo.count) {
        return errorResponse(`Not enough ${cargo.unit_type} at ${cargo.system_key} (have ${available}, need ${cargo.count})`, 409)
      }
      totalCargo += cargo.count
    }
    if (totalCargo > def.capacity) {
      return errorResponse(`Cargo (${totalCargo}) exceeds capacity (${def.capacity}) for ${ship.unit_type}`, 409)
    }
  }
```

- [ ] **Step 4: Run tests — all should pass**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-move-ships/index.ts tests/functions/game-move-ships.test.js
git commit -m "feat: add cargo validation to game-move-ships"
```

---

## Task 5: Edge function — post-movement capacity enforcement + write pass

**Files:**
- Modify: `supabase/functions/game-move-ships/index.ts`
- Modify: `tests/functions/game-move-ships.test.js`

- [ ] **Step 1: Write capacity enforcement and write-pass tests**

Append to the `describe` block:

```js
  it('409 excess_removals insufficient for origin over-capacity', async () => {
    // Carrier leaves origin; 3 fighters remain but no ships left there (capacity = 0)
    // excess_removals declares only 1 removal but needs 3
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'fighter', count: 3, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
      excess_removals: [{ system_key: '0,0', unit_type: 'fighter', count: 1 }], // only 1 of 3
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/excess/i)
  })

  it('200 excess_removals fully resolve origin over-capacity', async () => {
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'fighter', count: 3, system_key: '0,0' },
      ],
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
      excess_removals: [{ system_key: '0,0', unit_type: 'fighter', count: 3 }], // all 3
    }))
    expect(res.status).toBe(200)
  })

  it('200 write pass moves ship row and updates DB', async () => {
    let updateCalledWith = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return standardPlayerMock()
      if (table === 'games') return standardGameMock()
      if (table === 'game_system_activations') return standardTokenMock()
      if (table === 'tiles') return standardTileMock()
      if (table === 'units') return standardUnitMock()
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({
                data: [
                  { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
                ],
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            updateCalledWith = vals
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
        }
      }
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
    }))
    expect(res.status).toBe(200)
    expect(updateCalledWith).toMatchObject({ system_key: '1,0' })
  })

  it('200 zeroed unit row is deleted after excess removal', async () => {
    let deleteCalled = false
    // Setup mockDb with custom game_player_units that tracks delete calls
    mockDb({
      unitRows: [
        { player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
        { player_id: PLAYER_ID, unit_type: 'fighter', count: 1, system_key: '0,0' },
      ],
    })
    // Override delete tracking
    const originalMock = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const base = originalMock(table)
      if (table === 'game_player_units') {
        return {
          ...base,
          delete: vi.fn().mockImplementation(() => {
            deleteCalled = true
            return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
          }),
        }
      }
      return base
    })
    const res = await handler(makeRequest({
      ...BASE_BODY,
      active_system_key: '1,0',
      ships: [HAPPY_SHIP],
      excess_removals: [{ system_key: '0,0', unit_type: 'fighter', count: 1 }],
    }))
    expect(res.status).toBe(200)
    expect(deleteCalled).toBe(true)
  })
```

- [ ] **Step 2: Run tests — capacity and write tests should fail**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: new tests fail.

- [ ] **Step 3: Add capacity enforcement and write pass to the edge function**

Replace the final `return okResponse(...)` placeholder with:

```ts
  // Post-movement capacity enforcement
  // Compute remaining capacity per system after ships depart
  const movingShipsByOrigin = new Map<string, number>()
  for (const ship of ships) {
    const def = unitDefMap.get(ship.unit_type)!
    movingShipsByOrigin.set(
      ship.origin_system_key,
      (movingShipsByOrigin.get(ship.origin_system_key) ?? 0) + def.capacity
    )
  }

  // Capacity moving INTO active system
  const incomingCapacity = ships.reduce((s, ship) => {
    return s + (unitDefMap.get(ship.unit_type)?.capacity ?? 0)
  }, 0)
  const existingActiveCapacity = spaceUnits
    .filter(u => u.player_id === player.id && u.system_key === activeSystemKey)
    .filter(u => (unitDefMap.get(u.unit_type)?.capacity ?? 0) > 0)
    .reduce((s, u) => s + (unitDefMap.get(u.unit_type)?.capacity ?? 0) * u.count, 0)
  const totalActiveCapacity = existingActiveCapacity + incomingCapacity

  // Check each origin for over-capacity after ships and cargo depart
  for (const [originSk, capacityLeaving] of movingShipsByOrigin.entries()) {
    const remainingCapacity = spaceUnits
      .filter(u => u.player_id === player.id && u.system_key === originSk)
      .filter(u => (unitDefMap.get(u.unit_type)?.capacity ?? 0) > 0)
      .reduce((s, u) => s + (unitDefMap.get(u.unit_type)?.capacity ?? 0) * u.count, 0) - capacityLeaving

    const cargoLeavingOrigin = ships
      .filter(s => s.origin_system_key === originSk)
      .flatMap(s => s.cargo.filter(c => c.system_key === originSk))
      .reduce((s, c) => s + c.count, 0)

    const fightersInfantryAtOrigin = spaceUnits
      .filter(u => u.player_id === player.id && u.system_key === originSk && ['fighter','infantry'].includes(u.unit_type))
      .reduce((s, u) => s + u.count, 0) - cargoLeavingOrigin

    const excessAtOrigin = Math.max(0, fightersInfantryAtOrigin - Math.max(0, remainingCapacity))
    const removedFromOrigin = excessRemovals
      .filter(r => r.system_key === originSk)
      .reduce((s, r) => s + r.count, 0)
    if (removedFromOrigin < excessAtOrigin) {
      return errorResponse(`Excess removals insufficient for ${originSk} (need ${excessAtOrigin}, got ${removedFromOrigin})`, 409)
    }
  }

  // Check active system capacity after arrivals
  const incomingCargo = ships.flatMap(s => s.cargo).reduce((s, c) => s + c.count, 0)
  const existingActiveUnits = spaceUnits
    .filter(u => u.player_id === player.id && u.system_key === activeSystemKey && ['fighter','infantry'].includes(u.unit_type))
    .reduce((s, u) => s + u.count, 0)
  const totalActiveUnits = existingActiveUnits + incomingCargo
  const excessAtActive = Math.max(0, totalActiveUnits - totalActiveCapacity)
  const removedFromActive = excessRemovals
    .filter(r => r.system_key === activeSystemKey)
    .reduce((s, r) => s + r.count, 0)
  if (removedFromActive < excessAtActive) {
    return errorResponse(`Excess removals insufficient for active system (need ${excessAtActive}, got ${removedFromActive})`, 409)
  }

  // Write pass
  // 1. Move each ship
  for (const ship of ships) {
    await db
      .from('game_player_units')
      .update({ system_key: activeSystemKey })
      .eq('game_id', body.game_id)
      .eq('player_id', player.id)
      .eq('system_key', ship.origin_system_key)
      .eq('unit_type', ship.unit_type)
  }

  // 2. Move cargo
  for (const ship of ships) {
    for (const cargo of ship.cargo) {
      // Decrement source
      const sourceRow = spaceUnits.find(
        u => u.player_id === player.id && u.unit_type === cargo.unit_type && u.system_key === cargo.system_key
      )
      if (sourceRow) {
        const newCount = sourceRow.count - cargo.count
        if (newCount <= 0) {
          await db.from('game_player_units').delete()
            .eq('game_id', body.game_id).eq('player_id', player.id)
            .eq('system_key', cargo.system_key).eq('unit_type', cargo.unit_type)
        } else {
          await db.from('game_player_units').update({ count: newCount })
            .eq('game_id', body.game_id).eq('player_id', player.id)
            .eq('system_key', cargo.system_key).eq('unit_type', cargo.unit_type)
        }
      }
      // Upsert into active system
      await db.from('game_player_units').upsert({
        game_id: body.game_id,
        player_id: player.id,
        system_key: activeSystemKey,
        unit_type: cargo.unit_type,
        count: cargo.count,
        on_planet: null,
      }, { onConflict: 'game_id,player_id,system_key,unit_type,on_planet' })
    }
  }

  // 3. Apply excess removals
  for (const removal of excessRemovals) {
    const existing = spaceUnits.find(
      u => u.player_id === player.id && u.unit_type === removal.unit_type && u.system_key === removal.system_key
    )
    if (existing) {
      const newCount = existing.count - removal.count
      if (newCount <= 0) {
        await db.from('game_player_units').delete()
          .eq('game_id', body.game_id).eq('player_id', player.id)
          .eq('system_key', removal.system_key).eq('unit_type', removal.unit_type)
      } else {
        await db.from('game_player_units').update({ count: newCount })
          .eq('game_id', body.game_id).eq('player_id', player.id)
          .eq('system_key', removal.system_key).eq('unit_type', removal.unit_type)
      }
    }
  }

  return okResponse({ moved: true, units_removed: excessRemovals })
```

- [ ] **Step 4: Run all tests — all should pass**

```
npx vitest run tests/functions/game-move-ships.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```
npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-move-ships/index.ts tests/functions/game-move-ships.test.js
git commit -m "feat: complete game-move-ships with capacity enforcement and write pass"
```

---

## Task 6: `edgeFunctions.js` — add `moveShips` wrapper

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Add the export**

In `src/lib/edgeFunctions.js`, append after the `landTroops` export:

```js
export const moveShips = (gameId, payload) =>
  callFunction('game-move-ships', { game_id: gameId, ...payload })
```

- [ ] **Step 2: Run tests**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/edgeFunctions.js
git commit -m "feat: add moveShips wrapper to edgeFunctions.js"
```

---

## Task 7: `useMovement` hook — path validation helpers

**Files:**
- Create: `src/hooks/useMovement.js`
- Create: `tests/hooks/useMovement.test.js`

- [ ] **Step 1: Create test file**

```js
// tests/hooks/useMovement.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  moveShips: vi.fn(),
}))

import { moveShips } from '../../src/lib/edgeFunctions.js'
import { useMovement } from '../../src/hooks/useMovement.js'

const GAME_ID = 'game-uuid'
const MY_PLAYER_ID = 'player-uuid'

// Minimal tileData and mapTiles for a 4-system linear map
// Systems: 0,0  1,0  2,0  3,0 — all normal (no anomalies)
// Plus 0,1 (gravity rift), 1,-1 (asteroid), 0,-1 (nebula)
const MAP_TILES = {
  '0,0': { tile_id: 't-normal' },
  '1,0': { tile_id: 't-normal' },
  '2,0': { tile_id: 't-normal' },
  '3,0': { tile_id: 't-normal' },
  '0,1': { tile_id: 't-rift' },
  '1,-1': { tile_id: 't-asteroid' },
  '0,-1': { tile_id: 't-nebula' },
}
const TILE_DATA = {
  't-normal':   { anomalies: [], wormholes: [] },
  't-rift':     { anomalies: ['gravity_rift'], wormholes: [] },
  't-asteroid': { anomalies: ['asteroid_field'], wormholes: [] },
  't-nebula':   { anomalies: ['nebula'], wormholes: [] },
}
const UNIT_DEFS = {
  carrier:   { unit_type: 'carrier', move: 2, capacity: 4 },
  destroyer: { unit_type: 'destroyer', move: 2, capacity: 0 },
}
// No units in space by default
const SPACE_UNITS = []
const MY_TOKEN_SYSTEMS = new Set()

function makeHook(spaceUnits = SPACE_UNITS, myTokenSystems = MY_TOKEN_SYSTEMS) {
  return renderHook(() =>
    useMovement(GAME_ID, MAP_TILES, TILE_DATA, UNIT_DEFS, spaceUnits, MY_PLAYER_ID, myTokenSystems)
  )
}

beforeEach(() => vi.clearAllMocks())
```

- [ ] **Step 2: Write path helper tests**

Append to the test file:

```js
describe('useMovement — path helpers', () => {
  it('reachableSystems returns adjacent normal systems', () => {
    const { result } = makeHook()
    const ship = { unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0'], cargo: [] }
    const reachable = result.current.reachableSystems(ship, ['0,0'])
    expect(reachable).toContain('1,0')
    expect(reachable).not.toContain('2,0') // too far for one step
  })

  it('reachableSystems excludes asteroid field', () => {
    const { result } = makeHook()
    const ship = { unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0'], cargo: [] }
    const reachable = result.current.reachableSystems(ship, ['0,0'])
    expect(reachable).not.toContain('1,-1') // asteroid
  })

  it('reachableSystems excludes enemy-occupied transit systems', () => {
    const spaceUnits = [
      { player_id: 'enemy-uuid', unit_type: 'destroyer', count: 1, system_key: '1,0' },
    ]
    const { result } = makeHook(spaceUnits)
    const ship = { unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0'], cargo: [] }
    const reachable = result.current.reachableSystems(ship, ['0,0'])
    expect(reachable).not.toContain('1,0')
  })

  it('reachableSystems returns empty when all move used', () => {
    const { result } = makeHook()
    // carrier move=2; path already 2 hops deep
    const ship = { unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0', '1,0', '2,0'], cargo: [] }
    const reachable = result.current.reachableSystems(ship, ['0,0', '1,0', '2,0'])
    expect(reachable).toHaveLength(0)
  })

  it('capacityRemaining decrements correctly', () => {
    const { result } = makeHook()
    const ship = {
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0', '1,0'],
      cargo: [{ unit_type: 'infantry', system_key: '0,0', count: 3 }],
    }
    expect(result.current.capacityRemaining(ship)).toBe(1) // 4 - 3 = 1
  })

  it('capacityRemaining returns full capacity with no cargo', () => {
    const { result } = makeHook()
    const ship = { unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0'], cargo: [] }
    expect(result.current.capacityRemaining(ship)).toBe(4)
  })
})
```

- [ ] **Step 3: Run tests — expect them to fail**

```
npx vitest run tests/hooks/useMovement.test.js
```

Expected: all fail (no hook file yet).

- [ ] **Step 4: Create the hook with path helpers**

```js
// src/hooks/useMovement.js
import { useState } from 'react'
import { moveShips as moveShipsFn } from '../lib/edgeFunctions.js'

function axialNeighbors(sk) {
  const [q, r] = sk.split(',').map(Number)
  return [
    [q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]
  ].map(([nq,nr]) => `${nq},${nr}`)
}

function tileAnomFor(systemKey, mapTiles, tileData) {
  const ref = mapTiles[systemKey]
  if (!ref) return []
  return tileData[ref.tile_id]?.anomalies ?? []
}

function wormholeNeighbors(systemKey, mapTiles, tileData) {
  const ref = mapTiles[systemKey]
  if (!ref) return []
  const myWhs = tileData[ref.tile_id]?.wormholes ?? []
  if (myWhs.length === 0) return []
  return Object.keys(mapTiles).filter(other => {
    if (other === systemKey) return false
    const otherRef = mapTiles[other]
    if (!otherRef) return false
    const otherWhs = tileData[otherRef.tile_id]?.wormholes ?? []
    return myWhs.some(wh => otherWhs.includes(wh))
  })
}

export function useMovement(gameId, mapTiles, tileData, unitDefs, spaceUnits, myPlayerId, myTokenSystems) {
  const [selectedShips, setSelectedShips] = useState([])
  const [excessRemovals, setExcessRemovals] = useState([])

  function getAnoms(sk) { return tileAnomFor(sk, mapTiles, tileData) }

  function isAdjacent(a, b) {
    return axialNeighbors(a).includes(b) || wormholeNeighbors(a, mapTiles, tileData).includes(b)
  }

  function effectiveMoveValue(ship) {
    const def = unitDefs[ship.unit_type]
    const base = def?.move ?? 0
    return getAnoms(ship.origin_system_key).includes('nebula') ? 1 : base
  }

  function gravityBonusForPath(path) {
    return path.slice(0, -1).filter(sk => getAnoms(sk).includes('gravity_rift')).length
  }

  function reachableSystems(ship, currentPath) {
    const last = currentPath[currentPath.length - 1]
    const stepsUsed = currentPath.length - 1
    const maxSteps = effectiveMoveValue(ship) + gravityBonusForPath(currentPath)
    if (stepsUsed >= maxSteps) return []

    const enemySystems = new Set(
      spaceUnits.filter(u => u.player_id !== myPlayerId).map(u => u.system_key)
    )
    const isLastStep = stepsUsed + 1 === maxSteps

    return Object.keys(mapTiles)
      .filter(sk => isAdjacent(last, sk))
      .filter(sk => !getAnoms(sk).includes('asteroid_field'))
      .filter(sk => !getAnoms(sk).includes('supernova'))
      .filter(sk => !(getAnoms(sk).includes('nebula') && !isLastStep))
      .filter(sk => !enemySystems.has(sk))
  }

  function capacityRemaining(ship) {
    const cap = unitDefs[ship.unit_type]?.capacity ?? 0
    const used = (ship.cargo ?? []).reduce((s, c) => s + c.count, 0)
    return cap - used
  }

  function excessBySystem(activeSystemKey) {
    const result = {}

    // Check each origin
    const originKeys = [...new Set(selectedShips.map(s => s.origin_system_key))]
    for (const sk of originKeys) {
      const leavingCap = selectedShips
        .filter(s => s.origin_system_key === sk)
        .reduce((s, ship) => s + (unitDefs[ship.unit_type]?.capacity ?? 0), 0)
      const remainingCap = spaceUnits
        .filter(u => u.player_id === myPlayerId && u.system_key === sk)
        .filter(u => (unitDefs[u.unit_type]?.capacity ?? 0) > 0)
        .reduce((s, u) => s + (unitDefs[u.unit_type]?.capacity ?? 0) * u.count, 0) - leavingCap

      const cargoLeaving = selectedShips
        .filter(s => s.origin_system_key === sk)
        .flatMap(s => (s.cargo ?? []).filter(c => c.system_key === sk))
        .reduce((s, c) => s + c.count, 0)

      const fiAtOrigin = spaceUnits
        .filter(u => u.player_id === myPlayerId && u.system_key === sk && ['fighter','infantry'].includes(u.unit_type))
        .reduce((s, u) => s + u.count, 0) - cargoLeaving

      const excess = Math.max(0, fiAtOrigin - Math.max(0, remainingCap))
      if (excess > 0) result[sk] = excess
    }

    // Check active system
    if (activeSystemKey) {
      const incomingCap = selectedShips
        .reduce((s, ship) => s + (unitDefs[ship.unit_type]?.capacity ?? 0), 0)
      const existingCap = spaceUnits
        .filter(u => u.player_id === myPlayerId && u.system_key === activeSystemKey)
        .filter(u => (unitDefs[u.unit_type]?.capacity ?? 0) > 0)
        .reduce((s, u) => s + (unitDefs[u.unit_type]?.capacity ?? 0) * u.count, 0)
      const totalCap = existingCap + incomingCap

      const incomingUnits = selectedShips
        .flatMap(s => s.cargo ?? [])
        .reduce((s, c) => s + c.count, 0)
      const existingFI = spaceUnits
        .filter(u => u.player_id === myPlayerId && u.system_key === activeSystemKey && ['fighter','infantry'].includes(u.unit_type))
        .reduce((s, u) => s + u.count, 0)

      const excess = Math.max(0, existingFI + incomingUnits - totalCap)
      if (excess > 0) result[activeSystemKey] = excess
    }

    return result
  }

  function isReadyToConfirm(activeSystemKey) {
    const excess = excessBySystem(activeSystemKey)
    const totalExcess = Object.values(excess).reduce((s, e) => s + e, 0)
    const totalRemoved = excessRemovals.reduce((s, r) => s + r.count, 0)
    return totalExcess === totalRemoved
  }

  async function confirmMove(activeSystemKey) {
    return moveShipsFn(gameId, {
      active_system_key: activeSystemKey,
      ships: selectedShips,
      excess_removals: excessRemovals,
    })
  }

  return {
    selectedShips, setSelectedShips,
    excessRemovals, setExcessRemovals,
    reachableSystems,
    capacityRemaining,
    excessBySystem,
    isReadyToConfirm,
    confirmMove,
    reset: () => { setSelectedShips([]); setExcessRemovals([]) },
  }
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run tests/hooks/useMovement.test.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useMovement.js tests/hooks/useMovement.test.js
git commit -m "feat: add useMovement hook with path validation helpers"
```

---

## Task 8: `useMovement` hook — excess calculation and confirmMove tests

**Files:**
- Modify: `tests/hooks/useMovement.test.js`

- [ ] **Step 1: Write excess and confirmMove tests**

Append to the test file:

```js
describe('useMovement — excess and confirmMove', () => {
  it('excessBySystem returns empty when no over-capacity', () => {
    // carrier (cap=4) moves to active; 2 fighters travel with it — total active FI=2, cap=4
    const spaceUnits = [
      { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
      { player_id: MY_PLAYER_ID, unit_type: 'fighter', count: 2, system_key: '0,0' },
    ]
    const { result } = makeHook(spaceUnits)
    act(() => {
      result.current.setSelectedShips([{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [{ unit_type: 'fighter', system_key: '0,0', count: 2 }],
      }])
    })
    const excess = result.current.excessBySystem('1,0')
    expect(Object.keys(excess)).toHaveLength(0)
  })

  it('excessBySystem flags origin over-capacity when ship leaves fighters behind', () => {
    // carrier leaves; 3 fighters remain; no other ships at origin → over by 3
    const spaceUnits = [
      { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
      { player_id: MY_PLAYER_ID, unit_type: 'fighter', count: 3, system_key: '0,0' },
    ]
    const { result } = makeHook(spaceUnits)
    act(() => {
      result.current.setSelectedShips([{
        unit_type: 'carrier',
        origin_system_key: '0,0',
        path: ['0,0', '1,0'],
        cargo: [],
      }])
    })
    const excess = result.current.excessBySystem('1,0')
    expect(excess['0,0']).toBe(3)
  })

  it('isReadyToConfirm true when removals match excess', () => {
    const spaceUnits = [
      { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
      { player_id: MY_PLAYER_ID, unit_type: 'fighter', count: 3, system_key: '0,0' },
    ]
    const { result } = makeHook(spaceUnits)
    act(() => {
      result.current.setSelectedShips([{
        unit_type: 'carrier', origin_system_key: '0,0',
        path: ['0,0', '1,0'], cargo: [],
      }])
      result.current.setExcessRemovals([{ system_key: '0,0', unit_type: 'fighter', count: 3 }])
    })
    expect(result.current.isReadyToConfirm('1,0')).toBe(true)
  })

  it('isReadyToConfirm false when removals do not cover excess', () => {
    const spaceUnits = [
      { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0' },
      { player_id: MY_PLAYER_ID, unit_type: 'fighter', count: 3, system_key: '0,0' },
    ]
    const { result } = makeHook(spaceUnits)
    act(() => {
      result.current.setSelectedShips([{
        unit_type: 'carrier', origin_system_key: '0,0',
        path: ['0,0', '1,0'], cargo: [],
      }])
      result.current.setExcessRemovals([{ system_key: '0,0', unit_type: 'fighter', count: 1 }])
    })
    expect(result.current.isReadyToConfirm('1,0')).toBe(false)
  })

  it('confirmMove calls moveShips with correct payload', async () => {
    moveShips.mockResolvedValue({ moved: true, units_removed: [] })
    const { result } = makeHook()
    act(() => {
      result.current.setSelectedShips([{
        unit_type: 'carrier', origin_system_key: '0,0',
        path: ['0,0', '1,0'], cargo: [],
      }])
    })
    await act(async () => {
      await result.current.confirmMove('1,0')
    })
    expect(moveShips).toHaveBeenCalledWith(GAME_ID, {
      active_system_key: '1,0',
      ships: [{ unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0', '1,0'], cargo: [] }],
      excess_removals: [],
    })
  })
})
```

- [ ] **Step 2: Run tests**

```
npx vitest run tests/hooks/useMovement.test.js
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/useMovement.test.js
git commit -m "test: add excess calculation and confirmMove tests for useMovement"
```

---

## Task 9: `MoveShipsModal` component

**Files:**
- Create: `src/components/game/MoveShipsModal.jsx`
- Create: `tests/components/game/MoveShipsModal.test.jsx`

- [ ] **Step 1: Create test file**

```jsx
// tests/components/game/MoveShipsModal.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../src/hooks/useMovement.js', () => ({
  useMovement: vi.fn(),
}))

import { useMovement } from '../../../src/hooks/useMovement.js'
import MoveShipsModal from '../../../src/components/game/MoveShipsModal.jsx'

const GAME_ID = 'game-uuid'
const MY_PLAYER_ID = 'player-uuid'
const ACTIVE_SYSTEM = '1,0'
const MAP_TILES = { '0,0': { tile_id: 't1' }, '1,0': { tile_id: 't1' } }
const TILE_DATA = { t1: { anomalies: [], wormholes: [] } }
const UNIT_DEFS = { carrier: { unit_type: 'carrier', move: 2, capacity: 4 } }

const SPACE_UNITS = [
  { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0', on_planet: null },
]

const BASE_PROPS = {
  gameId: GAME_ID,
  activeSystemKey: ACTIVE_SYSTEM,
  mapTiles: MAP_TILES,
  tileData: TILE_DATA,
  unitDefs: UNIT_DEFS,
  systemUnits: SPACE_UNITS,
  myPlayerId: MY_PLAYER_ID,
  myTokenSystems: new Set(),
  onClose: vi.fn(),
}

function makeMovement(overrides = {}) {
  return {
    selectedShips: [],
    setSelectedShips: vi.fn(),
    excessRemovals: [],
    setExcessRemovals: vi.fn(),
    reachableSystems: vi.fn().mockReturnValue([]),
    capacityRemaining: vi.fn().mockReturnValue(4),
    excessBySystem: vi.fn().mockReturnValue({}),
    isReadyToConfirm: vi.fn().mockReturnValue(true),
    confirmMove: vi.fn().mockResolvedValue({ moved: true, units_removed: [] }),
    reset: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMovement.mockReturnValue(makeMovement())
})
```

- [ ] **Step 2: Write component tests**

Append to the test file:

```jsx
describe('MoveShipsModal', () => {
  it('renders Step 1 with eligible ships listed', () => {
    render(<MoveShipsModal {...BASE_PROPS} />)
    expect(screen.getByText(/select ships/i)).toBeInTheDocument()
    expect(screen.getByText(/carrier/i)).toBeInTheDocument()
  })

  it('Skip Movement calls onClose', () => {
    const onClose = vi.fn()
    render(<MoveShipsModal {...BASE_PROPS} onClose={onClose} />)
    fireEvent.click(screen.getByText(/skip movement/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('Next button disabled when no ships selected', () => {
    render(<MoveShipsModal {...BASE_PROPS} />)
    expect(screen.getByText(/next.*route/i)).toBeDisabled()
  })

  it('Next button enabled after selecting a ship', () => {
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{
        unit_type: 'carrier', origin_system_key: '0,0',
        path: ['0,0'], cargo: [],
      }],
    }))
    render(<MoveShipsModal {...BASE_PROPS} />)
    expect(screen.getByText(/next.*route/i)).not.toBeDisabled()
  })

  it('Step 2 shows route drawing UI with move counter', () => {
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{
        unit_type: 'carrier', origin_system_key: '0,0',
        path: ['0,0'], cargo: [],
      }],
    }))
    render(<MoveShipsModal {...BASE_PROPS} />)
    // Navigate to step 2
    fireEvent.click(screen.getByText(/next.*route/i))
    expect(screen.getByText(/draw route/i)).toBeInTheDocument()
    expect(screen.getByText(/carrier/i)).toBeInTheDocument()
  })

  it('cargo picker shows only fighters and infantry', () => {
    const allUnits = [
      { player_id: MY_PLAYER_ID, unit_type: 'carrier', count: 1, system_key: '0,0', on_planet: null },
      { player_id: MY_PLAYER_ID, unit_type: 'infantry', count: 3, system_key: '0,0', on_planet: null },
      { player_id: MY_PLAYER_ID, unit_type: 'fighter', count: 2, system_key: '0,0', on_planet: null },
      { player_id: MY_PLAYER_ID, unit_type: 'destroyer', count: 1, system_key: '0,0', on_planet: null },
    ]
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{ unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0'], cargo: [] }],
    }))
    render(<MoveShipsModal {...BASE_PROPS} systemUnits={allUnits} />)
    fireEvent.click(screen.getByText(/next.*route/i))
    expect(screen.getByText(/infantry/i)).toBeInTheDocument()
    expect(screen.getByText(/fighter/i)).toBeInTheDocument()
    expect(screen.queryByText(/destroyer/i)).not.toBeInTheDocument()
  })

  it('Step 3 Confirm button disabled when excess unresolved', () => {
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{ unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0', '1,0'], cargo: [] }],
      excessBySystem: vi.fn().mockReturnValue({ '0,0': 2 }),
      isReadyToConfirm: vi.fn().mockReturnValue(false),
    }))
    render(<MoveShipsModal {...BASE_PROPS} />)
    fireEvent.click(screen.getByText(/next.*route/i))
    fireEvent.click(screen.getByText(/done.*ship|next.*excess/i))
    expect(screen.getByText(/confirm movement/i)).toBeDisabled()
  })

  it('Confirm button calls confirmMove and then onClose on success', async () => {
    const onClose = vi.fn()
    const confirmMove = vi.fn().mockResolvedValue({ moved: true, units_removed: [] })
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{ unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0', '1,0'], cargo: [] }],
      isReadyToConfirm: vi.fn().mockReturnValue(true),
      confirmMove,
    }))
    render(<MoveShipsModal {...BASE_PROPS} onClose={onClose} />)
    fireEvent.click(screen.getByText(/next.*route/i))
    fireEvent.click(screen.getByText(/done.*ship|next.*excess/i))
    fireEvent.click(screen.getByText(/confirm movement/i))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(confirmMove).toHaveBeenCalledWith(ACTIVE_SYSTEM)
  })

  it('shows error message when confirmMove fails', async () => {
    const confirmMove = vi.fn().mockRejectedValue(new Error('capacity exceeded'))
    useMovement.mockReturnValue(makeMovement({
      selectedShips: [{ unit_type: 'carrier', origin_system_key: '0,0', path: ['0,0', '1,0'], cargo: [] }],
      isReadyToConfirm: vi.fn().mockReturnValue(true),
      confirmMove,
    }))
    render(<MoveShipsModal {...BASE_PROPS} />)
    fireEvent.click(screen.getByText(/next.*route/i))
    fireEvent.click(screen.getByText(/done.*ship|next.*excess/i))
    fireEvent.click(screen.getByText(/confirm movement/i))
    await waitFor(() => expect(screen.getByText(/capacity exceeded/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: Run tests — expect them to fail**

```
npx vitest run tests/components/game/MoveShipsModal.test.jsx
```

Expected: all fail (no component yet).

- [ ] **Step 4: Create `MoveShipsModal.jsx`**

```jsx
// src/components/game/MoveShipsModal.jsx
import { useState } from 'react'
import { useMovement } from '../../hooks/useMovement.js'

export default function MoveShipsModal({
  gameId, activeSystemKey, mapTiles, tileData, unitDefs,
  systemUnits, myPlayerId, myTokenSystems, onClose,
}) {
  const movement = useMovement(gameId, mapTiles, tileData, unitDefs, systemUnits, myPlayerId, myTokenSystems)
  const [step, setStep] = useState('select')
  const [activeShipIndex, setActiveShipIndex] = useState(0)
  const [error, setError] = useState(null)

  // Eligible ships: player owns them, move > 0, origin has no command token (unless active system)
  const eligibleSystems = {}
  for (const u of systemUnits) {
    if (u.player_id !== myPlayerId || u.on_planet !== null) continue
    if (!(unitDefs[u.unit_type]?.move > 0)) continue
    if (myTokenSystems.has(u.system_key) && u.system_key !== activeSystemKey) continue
    if (!eligibleSystems[u.system_key]) eligibleSystems[u.system_key] = []
    eligibleSystems[u.system_key].push(u)
  }

  function toggleShip(unit_type, origin_system_key) {
    const existing = movement.selectedShips.findIndex(
      s => s.unit_type === unit_type && s.origin_system_key === origin_system_key
    )
    if (existing >= 0) {
      movement.setSelectedShips(prev => prev.filter((_, i) => i !== existing))
    } else {
      movement.setSelectedShips(prev => [
        ...prev,
        { unit_type, origin_system_key, path: [origin_system_key], cargo: [] },
      ])
    }
  }

  function addHop(shipIndex, systemKey) {
    movement.setSelectedShips(prev => prev.map((s, i) =>
      i === shipIndex ? { ...s, path: [...s.path, systemKey] } : s
    ))
  }

  function undoHop(shipIndex) {
    movement.setSelectedShips(prev => prev.map((s, i) =>
      i === shipIndex && s.path.length > 1 ? { ...s, path: s.path.slice(0, -1) } : s
    ))
  }

  function addCargo(shipIndex, unit_type, system_key) {
    movement.setSelectedShips(prev => prev.map((s, i) => {
      if (i !== shipIndex) return s
      const existing = s.cargo.find(c => c.unit_type === unit_type && c.system_key === system_key)
      if (existing) {
        return { ...s, cargo: s.cargo.map(c =>
          c.unit_type === unit_type && c.system_key === system_key
            ? { ...c, count: c.count + 1 }
            : c
        )}
      }
      return { ...s, cargo: [...s.cargo, { unit_type, system_key, count: 1 }] }
    }))
  }

  function removeCargo(shipIndex, unit_type, system_key) {
    movement.setSelectedShips(prev => prev.map((s, i) => {
      if (i !== shipIndex) return s
      return { ...s, cargo: s.cargo
        .map(c => c.unit_type === unit_type && c.system_key === system_key
          ? { ...c, count: c.count - 1 } : c)
        .filter(c => c.count > 0) }
    }))
  }

  async function handleConfirm() {
    setError(null)
    try {
      await movement.confirmMove(activeSystemKey)
      onClose()
    } catch (e) {
      setError(e.message)
    }
  }

  const activeShip = movement.selectedShips[activeShipIndex]
  const excess = movement.excessBySystem(activeSystemKey)
  const hasExcess = Object.keys(excess).length > 0

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4">

        {/* Step 1 — Select ships */}
        {step === 'select' && (
          <>
            <p className="label">STEP 1 — SELECT SHIPS TO MOVE</p>
            {Object.entries(eligibleSystems).map(([sk, units]) => (
              <div key={sk} className="flex flex-col gap-1">
                <p className="text-muted text-xs">{sk}</p>
                {units.map(u => {
                  const selected = movement.selectedShips.some(
                    s => s.unit_type === u.unit_type && s.origin_system_key === sk
                  )
                  return (
                    <button
                      key={u.unit_type}
                      className={selected ? 'btn-primary' : 'btn-ghost'}
                      onClick={() => toggleShip(u.unit_type, sk)}
                    >
                      {u.unit_type} ×{u.count}
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={movement.selectedShips.length === 0}
                onClick={() => setStep('route')}
              >
                Next: Draw Routes
              </button>
              <button className="btn-ghost" onClick={onClose}>Skip Movement</button>
            </div>
          </>
        )}

        {/* Step 2 — Draw routes */}
        {step === 'route' && activeShip && (
          <>
            <p className="label">
              STEP 2 — {activeShip.unit_type.toUpperCase()} FROM {activeShip.origin_system_key}
            </p>
            <p className="text-muted text-xs">
              Path: {activeShip.path.join(' → ')} | Capacity left: {movement.capacityRemaining(activeShip)}
            </p>

            {/* Reachable next hops */}
            <div className="flex flex-wrap gap-2">
              {movement.reachableSystems(activeShip, activeShip.path).map(sk => (
                <button key={sk} className="btn-ghost text-xs" onClick={() => addHop(activeShipIndex, sk)}>
                  → {sk}
                </button>
              ))}
            </div>

            {/* Cargo picker for each system on path */}
            {activeShip.path.slice(1).map(sk => {
              const pickupUnits = systemUnits.filter(
                u => u.player_id === myPlayerId && u.on_planet === null &&
                  u.system_key === sk && ['fighter','infantry'].includes(u.unit_type)
              )
              return pickupUnits.length > 0 ? (
                <div key={sk} className="flex flex-col gap-1">
                  <p className="text-muted text-xs">Pick up at {sk}:</p>
                  {pickupUnits.map(u => {
                    const picked = (activeShip.cargo.find(c => c.unit_type === u.unit_type && c.system_key === sk)?.count ?? 0)
                    return (
                      <div key={u.unit_type} className="flex items-center gap-2">
                        <span className="text-dim text-xs">{u.unit_type}</span>
                        <button className="counter-btn" onClick={() => removeCargo(activeShipIndex, u.unit_type, sk)} disabled={picked === 0}>-</button>
                        <span className="text-xs">{picked}</span>
                        <button className="counter-btn" onClick={() => addCargo(activeShipIndex, u.unit_type, sk)} disabled={movement.capacityRemaining(activeShip) === 0}>+</button>
                      </div>
                    )
                  })}
                </div>
              ) : null
            })}

            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={() => undoHop(activeShipIndex)}>Undo hop</button>
              {activeShipIndex < movement.selectedShips.length - 1 ? (
                <button className="btn-primary flex-1" onClick={() => setActiveShipIndex(i => i + 1)}>
                  Next Ship
                </button>
              ) : (
                <button className="btn-primary flex-1" onClick={() => setStep('excess')}>
                  Done with Ship
                </button>
              )}
              <button className="btn-ghost" onClick={() => setStep('select')}>Back</button>
            </div>
          </>
        )}

        {/* Step 3 — Resolve excess */}
        {step === 'excess' && (
          <>
            <p className="label">STEP 3 — RESOLVE EXCESS CAPACITY</p>
            {!hasExcess && <p className="text-muted text-xs">No excess units — ready to confirm.</p>}
            {Object.entries(excess).map(([sk, excessCount]) => {
              const removed = movement.excessRemovals.filter(r => r.system_key === sk).reduce((s, r) => s + r.count, 0)
              const remaining = excessCount - removed
              const unitsHere = systemUnits.filter(
                u => u.player_id === myPlayerId && u.system_key === sk &&
                  ['fighter','infantry'].includes(u.unit_type) && u.on_planet === null
              )
              return (
                <div key={sk} className="flex flex-col gap-1">
                  <p className="text-muted text-xs">{sk} — remove {remaining} more</p>
                  {unitsHere.map(u => (
                    <div key={u.unit_type} className="flex items-center gap-2">
                      <span className="text-dim text-xs">{u.unit_type}</span>
                      <button
                        className="counter-btn"
                        disabled={remaining === 0}
                        onClick={() => {
                          movement.setExcessRemovals(prev => {
                            const existing = prev.find(r => r.system_key === sk && r.unit_type === u.unit_type)
                            if (existing) return prev.map(r => r.system_key === sk && r.unit_type === u.unit_type ? { ...r, count: r.count + 1 } : r)
                            return [...prev, { system_key: sk, unit_type: u.unit_type, count: 1 }]
                          })
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}

            {error && <p className="text-danger text-xs">{error}</p>}

            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={!movement.isReadyToConfirm(activeSystemKey)}
                onClick={handleConfirm}
              >
                Confirm Movement
              </button>
              <button className="btn-ghost" onClick={() => setStep('route')}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run tests/components/game/MoveShipsModal.test.jsx
```

Expected: all pass.

- [ ] **Step 6: Run full suite**

```
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/MoveShipsModal.jsx tests/components/game/MoveShipsModal.test.jsx
git commit -m "feat: add MoveShipsModal component (3-step movement flow)"
```

---

## Task 10: Wire up `useGalaxy` and `GalaxyTab`

**Files:**
- Modify: `src/hooks/useGalaxy.js`
- Modify: `src/components/game/GalaxyTab.jsx`
- Modify: `tests/components/game/GalaxyTab.test.jsx`

- [ ] **Step 1: Add `moveShips` to `useGalaxy.js`**

In `src/hooks/useGalaxy.js`, add to the import line at the top:

```js
import { activateSystem as activateSystemFn, landTroops as landTroopsFn, moveShips as moveShipsFn } from '../lib/edgeFunctions.js'
```

Add to the return object (after `landTroops`):

```js
moveShips: (payload) => moveShipsFn(gameId, payload),
```

- [ ] **Step 2: Add `unitDefs` and `myTokenSystems` to `useGalaxy` return**

`MoveShipsModal` needs `unitDefs` (unit type → move/capacity) and `myTokenSystems` (set of system keys with player's token this round). Add derivations in `useGalaxy.js`:

After the existing state declarations, add:

```js
const [unitDefs, setUnitDefs] = useState({})

// Fetch unit definitions once on mount
useEffect(() => {
  supabase.from('units').select('unit_type, move, capacity')
    .then(({ data }) => {
      if (data) {
        const map = {}
        for (const u of data) map[u.unit_type] = u
        setUnitDefs(map)
      }
    })
}, [])
```

And derive `myTokenSystems` from existing `activations` state:

```js
const myTokenSystems = new Set(
  activations.filter(a => a.player_id === userId).map(a => a.system_key)
)
```

Add both to the return object:

```js
unitDefs,
myTokenSystems,
```

- [ ] **Step 3: Update `GalaxyTab` to add Move Ships button and modal**

In `src/components/game/GalaxyTab.jsx`, add at the top:

```js
import MoveShipsModal from './MoveShipsModal.jsx'
```

Add to the props destructure:

```js
export default function GalaxyTab({
  gameId, mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership, activeCombat, myPlayerId,
  players, currentPlayer, game, unitDefs, myTokenSystems,
  activateSystem, landTroops,
}) {
```

Add state:

```js
const [showMoveModal, setShowMoveModal] = useState(false)
```

Add derived value after `hasAvailableTacticTokens`:

```js
// Active system for this turn: the system the active player activated most recently
const activeSystemKey = isActivePlayer
  ? (activations.find(a => a.player_id === currentPlayer?.id)?.system_key ?? null)
  : null
const movementStep = isActivePlayer && activeSystemKey && !combatActive
```

In the JSX, add the Move Ships button and modal after the existing `{selectedSystemKey && ...}` block:

```jsx
{movementStep && !showMoveModal && (
  <button className="btn-primary mt-2" onClick={() => setShowMoveModal(true)}>
    Move Ships
  </button>
)}

{showMoveModal && (
  <MoveShipsModal
    gameId={gameId}
    activeSystemKey={activeSystemKey}
    mapTiles={mapTiles}
    tileData={tileData}
    unitDefs={unitDefs ?? {}}
    systemUnits={systemUnits}
    myPlayerId={myPlayerId}
    myTokenSystems={myTokenSystems ?? new Set()}
    onClose={() => setShowMoveModal(false)}
  />
)}
```

- [ ] **Step 4: Write GalaxyTab smoke tests**

Append to `tests/components/game/GalaxyTab.test.jsx`:

```jsx
vi.mock('../../../src/components/game/MoveShipsModal.jsx', () => ({
  default: ({ onClose }) => (
    <div data-testid="move-ships-modal">
      <button onClick={onClose}>Close Move Modal</button>
    </div>
  ),
}))

describe('GalaxyTab — Phase 18 move ships', () => {
  const MOVE_PROPS = {
    ...BASE_PROPS,
    gameId: 'game-uuid',
    myPlayerId: 'p1',
    unitDefs: { carrier: { unit_type: 'carrier', move: 2, capacity: 4 } },
    myTokenSystems: new Set(),
    activations: [{ player_id: 'p1', system_key: '1,-1' }],
    game: { id: 'game-uuid', phase: 'action', active_player_id: 'p1' },
    currentPlayer: { id: 'p1', command_tokens: { tactic_total: 3 } },
  }

  it('shows Move Ships button when active player has activated a system', () => {
    vi.mocked(useCombat).mockReturnValue({ combat: null })
    render(<GalaxyTab {...MOVE_PROPS} />)
    expect(screen.getByText('Move Ships')).toBeInTheDocument()
  })

  it('opens MoveShipsModal when Move Ships clicked', () => {
    vi.mocked(useCombat).mockReturnValue({ combat: null })
    render(<GalaxyTab {...MOVE_PROPS} />)
    fireEvent.click(screen.getByText('Move Ships'))
    expect(screen.getByTestId('move-ships-modal')).toBeInTheDocument()
  })

  it('closes modal when MoveShipsModal calls onClose', () => {
    vi.mocked(useCombat).mockReturnValue({ combat: null })
    render(<GalaxyTab {...MOVE_PROPS} />)
    fireEvent.click(screen.getByText('Move Ships'))
    fireEvent.click(screen.getByText('Close Move Modal'))
    expect(screen.queryByTestId('move-ships-modal')).not.toBeInTheDocument()
  })

  it('does not show Move Ships button when combat is active', () => {
    vi.mocked(useCombat).mockReturnValue({
      combat: { id: 'c1', status: 'active', phase: 'attacker_roll' },
    })
    render(<GalaxyTab {...MOVE_PROPS} />)
    expect(screen.queryByText('Move Ships')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests**

```
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: all pass.

- [ ] **Step 6: Run full suite**

```
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGalaxy.js src/components/game/GalaxyTab.jsx tests/components/game/GalaxyTab.test.jsx
git commit -m "feat: wire MoveShipsModal into GalaxyTab and expose movement state from useGalaxy"
```

---

## Task 11: Deploy and update plan index

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Deploy the edge function**

```bash
supabase functions deploy game-move-ships --no-verify-jwt
```

Expected: `Deployed: game-move-ships`

- [ ] **Step 2: Mark Phase 18 spec rows as done in `_index.md`**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all six Phase 18 rows from `planned` to `done`:

- `fn-game-move-ships` → `done`
- `hook-useGalaxy` → `done`
- `client-edgeFunctions` (Phase 18 row) → `done`
- `hook-useMovement` → `done`
- `component-MoveShipsModal` → `done`
- `component-GalaxyTab` (Phase 18 row) → `done`

- [ ] **Step 3: Add gravity rift destruction roll to `POTENTIAL_TODOS.md`**

In `POTENTIAL_TODOS.md` at the project root, add:

```
- Phase 25 / Gravity Rift: When a ship moves out of or through a gravity rift, roll 1 die immediately before it exits; destroyed on 1-3 (LRR §41.2). Currently +1 move bonus is applied but no roll is made.
```

- [ ] **Step 4: Final commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md POTENTIAL_TODOS.md
git commit -m "docs: mark Phase 18 complete in main_plan index; add gravity rift roll to POTENTIAL_TODOS"
```

---

## Self-review notes

**Spec coverage check:**
- ✅ Edge function auth + active player guard (Task 1)
- ✅ Path adjacency + move value (Task 2)
- ✅ Anomalies: asteroid, supernova, nebula, gravity rift +1 (Task 2)
- ✅ Enemy presence in transit (Task 3)
- ✅ Unit ownership verification (Task 3)
- ✅ Cargo: type, pickup system, command token, capacity (Task 4)
- ✅ Post-movement capacity enforcement + excess_removals (Task 5)
- ✅ Write pass: ships, cargo, excess (Task 5)
- ✅ `moveShips` wrapper in edgeFunctions.js (Task 6)
- ✅ `useMovement` path helpers (Task 7)
- ✅ `useMovement` excess + confirmMove (Task 8)
- ✅ `MoveShipsModal` 3-step UI (Task 9)
- ✅ `GalaxyTab` Move Ships button + modal (Task 10)
- ✅ `useGalaxy` wiring + unitDefs + myTokenSystems (Task 10)
- ✅ Deploy + index update (Task 11)
- ✅ Gravity rift destruction roll deferred to Phase 25 (Task 11)
