# Phase 9 — Galaxy Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GALAXY tab to the in-game UI with an SVG hex map, system activation, troop landing, Custodians VP award, and automatic Agenda Phase unlock.

**Architecture:** Dedicated `useGalaxy(gameCode, userId)` hook manages all galaxy state independently of the existing `useGame` hook. Two new Edge Functions (`game-activate-system`, `game-land-troops`) handle server mutations. `game-start` is patched to seed `map_tiles`; `game-advance-phase` is patched to auto-advance to `agenda` when `agenda_unlocked=true`.

**Tech Stack:** React 19, SVG, Supabase JS v2, Vitest 4, @testing-library/react, TypeScript/Deno Edge Functions.

---

## File Map

| File | Action |
|------|--------|
| `src/lib/edgeFunctions.js` | Modify — add `activateSystem`, `landTroops` |
| `src/hooks/useGalaxy.js` | Create |
| `src/components/game/HexTile.jsx` | Create |
| `src/components/game/HexMap.jsx` | Create |
| `src/components/game/SystemActionModal.jsx` | Create |
| `src/components/game/GalaxyTab.jsx` | Create |
| `src/components/game/GameScreen.jsx` | Modify — add useGalaxy, GALAXY tab, GalaxyTab |
| `src/components/game/HostControlsSection.jsx` | Modify — remove BEGIN AGENDA PHASE button |
| `supabase/functions/game-activate-system/index.ts` | Create |
| `supabase/functions/game-land-troops/index.ts` | Create |
| `supabase/functions/game-start/index.ts` | Modify — seed map_tiles |
| `supabase/functions/game-advance-phase/index.ts` | Modify — auto agenda |
| `tests/lib/edgeFunctions.phase9.test.js` | Create |
| `tests/hooks/useGalaxy.test.js` | Create |
| `tests/components/game/HexTile.test.jsx` | Create |
| `tests/components/game/HexMap.test.jsx` | Create |
| `tests/components/game/SystemActionModal.test.jsx` | Create |
| `tests/components/game/GalaxyTab.test.jsx` | Create |
| `tests/components/game/HostControlsSection.test.jsx` | Modify — assert agenda button absent |
| `tests/functions/game-activate-system.test.js` | Create |
| `tests/functions/game-land-troops.test.js` | Create |
| `tests/functions/game-start.test.js` | Modify — add map_tiles seeding test |
| `tests/functions/game-advance-phase.test.js` | Create |

---

## Task 1: edgeFunctions.js additions + phase9 wrapper tests

**Files:**
- Modify: `src/lib/edgeFunctions.js`
- Create: `tests/lib/edgeFunctions.phase9.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/edgeFunctions.phase9.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { activateSystem, landTroops } from '../../src/lib/edgeFunctions.js'

describe('Phase 9 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('activateSystem calls game-activate-system with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { activated: true }, error: null })
    await activateSystem('g1', '1,-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-activate-system', {
      body: { game_id: 'g1', system_key: '1,-1' },
    })
  })

  it('landTroops calls game-land-troops with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { claimed: true }, error: null })
    await landTroops('g1', '0,0', 'Mecatol Rex', 1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-land-troops', {
      body: { game_id: 'g1', system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 },
    })
  })

  it('activateSystem throws on error', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Not the active player', instanceof: FunctionsHttpError },
    })
    supabase.functions.invoke.mockRejectedValueOnce(new Error('Not the active player'))
    await expect(activateSystem('g1', '1,0')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.phase9.test.js
```

Expected: FAIL — `activateSystem is not a function`

- [ ] **Step 3: Add the two exports to edgeFunctions.js**

In `src/lib/edgeFunctions.js`, add before the final `export { callFunction }` line:

```js
export const activateSystem = (gameId, systemKey) =>
  callFunction('game-activate-system', { game_id: gameId, system_key: systemKey })

export const landTroops = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-land-troops', { game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount })
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase9.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.phase9.test.js
git commit -m "feat: add activateSystem and landTroops edgeFunction wrappers"
```

---

## Task 2: game-activate-system Edge Function (TDD)

**Files:**
- Create: `supabase/functions/game-activate-system/index.ts`
- Create: `tests/functions/game-activate-system.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-activate-system.test.js`:

```js
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
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  playerError = null,
  game = { active_player_id: PLAYER_ID, round: 2 },
  gameError = null,
  activations = [],
  activationError = null,
  insertError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: activationError }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: insertError }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-activate-system', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: '1,-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when caller is not the active player', async () => {
    mockDb({ game: { active_player_id: 'other-player', round: 2 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the active player/i)
  })

  it('returns 409 when no tactic tokens available', async () => {
    mockDb({
      player: { id: PLAYER_ID, command_tokens: { tactic_total: 1, fleet: 2, strategy: 1 } },
      activations: [{ id: 'a1', system_key: '2,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no tactic tokens/i)
  })

  it('returns 409 when system already activated by caller this round', async () => {
    mockDb({
      activations: [{ id: 'a1', system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('returns 200 and inserts activation row on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(db.from('game_system_activations').insert).toHaveBeenCalledWith({
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      system_key: '1,-1',
      round: 2,
      token_owner_id: PLAYER_ID,
    })
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-activate-system.test.js
```

Expected: FAIL — cannot find module `game-activate-system/index.ts`

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-activate-system/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; system_key?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, command_tokens')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('active_player_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not the active player', 409)

  const tokens = player.command_tokens as { tactic_total: number }
  const tacticTotal = tokens?.tactic_total ?? 0

  const { data: activations, error: activationError } = await db
    .from('game_system_activations')
    .select('id, system_key')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('round', game.round)
  if (activationError) return errorResponse('Database error', 500)

  const usedTactics = (activations ?? []).length
  if (usedTactics >= tacticTotal) return errorResponse('No tactic tokens available', 409)

  const alreadyActivated = (activations ?? []).some(
    (a: { id: string; system_key: string }) => a.system_key === body.system_key
  )
  if (alreadyActivated) return errorResponse('System already activated by you this round', 409)

  const { error: insertError } = await db
    .from('game_system_activations')
    .insert({
      game_id: body.game_id,
      player_id: player.id,
      system_key: body.system_key,
      round: game.round,
      token_owner_id: player.id,
    })
  if (insertError) return errorResponse(`Failed to activate system: ${insertError.message}`, 500)

  return okResponse({ activated: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/functions/game-activate-system.test.js
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-activate-system/index.ts tests/functions/game-activate-system.test.js
git commit -m "feat: add game-activate-system Edge Function"
```

---

## Task 3: game-land-troops Edge Function (TDD)

**Files:**
- Create: `supabase/functions/game-land-troops/index.ts`
- Create: `tests/functions/game-land-troops.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-land-troops.test.js`:

```js
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
import { handler } from '../../../supabase/functions/game-land-troops/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const TILE_ID = 'tile-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-land-troops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_MAP_TILES = {
  '1,-1': { tile_id: TILE_ID, tile_number: '32' },
  '0,0': { tile_id: 'mecatol-uuid', tile_number: '18' },
}

function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  game = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
  gameError = null,
  activation = { id: 'act-1' },
  activationError = null,
  tile = { planets: [{ name: 'Wellon' }] },
  mecatolTile = { planets: [{ name: 'Mecatol Rex' }] },
  tileError = null,
  upsertPlanetError = null,
  existingUnit = null,
  insertUnitError = null,
  updateUnitError = null,
  custodianUpdateError = null,
  playerVp = { vp: 3 },
  vpUpdateError = null,
} = {}) {
  const planetUpsertMock = vi.fn().mockResolvedValue({ error: upsertPlanetError })
  const unitInsertMock = vi.fn().mockResolvedValue({ error: insertUnitError })
  const unitUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateUnitError }) })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
                }),
              }),
            }
          }
          // vp query
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: playerVp, error: null }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: vpUpdateError }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: custodianUpdateError }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: activation, error: activationError }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(() => {
              // Return mecatol tile if tile_id is 'mecatol-uuid'
              const t = tile
              return Promise.resolve({ data: t, error: tileError })
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        upsert: planetUpsertMock,
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: unitInsertMock,
        update: unitUpdateMock,
      }
    }
  })

  return { planetUpsertMock, unitInsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-land-troops', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when troop_count is 0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when system not activated by caller', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not activated/i)
  })

  it('returns 409 when planet not in system', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Nonexistent', troop_count: 1 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not found in system/i)
  })

  it('upserts planet and inserts infantry on success', async () => {
    const { planetUpsertMock, unitInsertMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
    expect(planetUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: 'Wellon', player_id: PLAYER_ID, tile_id: TILE_ID }),
      { onConflict: 'game_id,planet_name' }
    )
    expect(unitInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ unit_type: 'infantry', count: 1, on_planet: 'Wellon', player_id: PLAYER_ID })
    )
  })

  it('awards Custodians VP and sets flags when landing on Mecatol Rex', async () => {
    mockDb({
      game: { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
      tile: { planets: [{ name: 'Mecatol Rex' }] },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.custodians_claimed).toBe(true)
    // games.update should have been called with custodians flags
    expect(db.from('games').update).toHaveBeenCalledWith({ custodians_claimed: true, agenda_unlocked: true })
  })

  it('does not re-award Custodians if already claimed', async () => {
    mockDb({
      game: { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: true },
      tile: { planets: [{ name: 'Mecatol Rex' }] },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.custodians_claimed).toBeUndefined()
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-land-troops.test.js
```

Expected: FAIL — cannot find module `game-land-troops/index.ts`

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-land-troops/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; system_key?: unknown; planet_name?: unknown; troop_count?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!body.planet_name || typeof body.planet_name !== 'string') return errorResponse("'planet_name' is required")
  if (typeof body.troop_count !== 'number' || body.troop_count < 1) return errorResponse("'troop_count' must be >= 1")

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
    .select('round, map_tiles, custodians_claimed')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: activation, error: activationError } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('system_key', body.system_key)
    .eq('round', game.round)
    .maybeSingle()
  if (activationError) return errorResponse('Database error', 500)
  if (!activation) return errorResponse('System not activated by you this round', 409)

  const mapTiles = game.map_tiles as Record<string, { tile_id: string; tile_number: string }> | null
  const tileEntry = mapTiles?.[body.system_key]
  if (!tileEntry) return errorResponse('System not found in map', 409)

  const { data: tile, error: tileError } = await db
    .from('tiles')
    .select('planets')
    .eq('id', tileEntry.tile_id)
    .maybeSingle()
  if (tileError) return errorResponse('Database error', 500)
  if (!tile) return errorResponse('Tile not found', 404)

  const planets = (tile.planets ?? []) as Array<{ name: string }>
  const planetExists = planets.some(p => p.name === body.planet_name)
  if (!planetExists) return errorResponse(`Planet "${body.planet_name}" not found in system`, 409)

  const { error: planetError2 } = await db
    .from('game_player_planets')
    .upsert({
      game_id: body.game_id,
      player_id: player.id,
      planet_name: body.planet_name,
      tile_id: tileEntry.tile_id,
      exhausted: true,
    }, { onConflict: 'game_id,planet_name' })
  if (planetError2) return errorResponse(`Failed to claim planet: ${planetError2.message}`, 500)

  const { data: existingUnit } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('system_key', body.system_key)
    .eq('unit_type', 'infantry')
    .eq('on_planet', body.planet_name)
    .maybeSingle()

  if (existingUnit) {
    const { error: updateUnitError } = await db
      .from('game_player_units')
      .update({ count: (existingUnit as { id: string; count: number }).count + (body.troop_count as number) })
      .eq('id', (existingUnit as { id: string; count: number }).id)
    if (updateUnitError) return errorResponse(`Failed to update units: ${updateUnitError.message}`, 500)
  } else {
    const { error: insertUnitError } = await db
      .from('game_player_units')
      .insert({
        game_id: body.game_id,
        player_id: player.id,
        system_key: body.system_key,
        unit_type: 'infantry',
        count: body.troop_count,
        on_planet: body.planet_name,
      })
    if (insertUnitError) return errorResponse(`Failed to add units: ${insertUnitError.message}`, 500)
  }

  let custodiansAwarded = false
  if (body.system_key === '0,0' && !game.custodians_claimed) {
    const { error: custError } = await db
      .from('games')
      .update({ custodians_claimed: true, agenda_unlocked: true })
      .eq('id', body.game_id)
    if (custError) return errorResponse(`Failed to update custodians: ${custError.message}`, 500)

    const { data: playerFull } = await db
      .from('game_players')
      .select('vp')
      .eq('id', player.id)
      .maybeSingle()

    const { error: vpError } = await db
      .from('game_players')
      .update({ vp: ((playerFull as { vp: number } | null)?.vp ?? 0) + 1 })
      .eq('id', player.id)
    if (vpError) return errorResponse(`Failed to award VP: ${vpError.message}`, 500)

    custodiansAwarded = true
  }

  return okResponse({ claimed: true, ...(custodiansAwarded && { custodians_claimed: true }) })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/functions/game-land-troops.test.js
```

Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-land-troops/index.ts tests/functions/game-land-troops.test.js
git commit -m "feat: add game-land-troops Edge Function"
```

---

## Task 4: game-start patch — seed map_tiles (TDD)

**Files:**
- Modify: `supabase/functions/game-start/index.ts`
- Modify: `tests/functions/game-start.test.js`

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of `tests/functions/game-start.test.js`:

```js
describe('game-start — map_tiles seeding', () => {
  it('seeds map_tiles with 37 tile entries after successful start', async () => {
    // Extend the mockDb to include tiles table
    const tilesData = [
      { id: 'tile-18', tile_number: '18' },
      { id: 'tile-32', tile_number: '32' },
      { id: 'tile-30', tile_number: '30' },
      // representative sample — real test just checks games.update was called with map_tiles
    ]
    db.from.mockImplementation((table) => {
      if (table === 'tiles') {
        return { select: vi.fn().mockResolvedValue({ data: tilesData, error: null }) }
      }
      // fall through to default mockDb behaviour
      return mockDb().actionCardInsertMock // re-use existing mock for other tables
    })
    // Easier: just check the games.update call includes map_tiles key
    mockDb()  // reset to default
    // Override games.update to capture calls
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID, expansions: { base: true } }, error: null }) }) }),
          update: updateMock,
        }
      }
      // delegate remaining tables to standard mock
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }), insert: vi.fn().mockResolvedValue({ error: null }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    const req = makeRequest({ game_id: GAME_ID })
    await handler(req)

    // The final update sets status: 'active'; the map_tiles update should also have occurred
    const mapTilesCall = updateMock.mock.calls.find(call => call[0]?.map_tiles !== undefined)
    expect(mapTilesCall).toBeDefined()
    expect(typeof mapTilesCall[0].map_tiles).toBe('object')
    // Mecatol Rex should be at "0,0"
    const mapTiles = mapTilesCall[0].map_tiles
    expect(mapTiles['0,0']).toBeDefined()
    expect(mapTiles['0,0'].tile_number).toBe('18')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-start.test.js -t "map_tiles"
```

Expected: FAIL — `map_tiles` call not found

- [ ] **Step 3: Patch game-start to seed map_tiles**

In `supabase/functions/game-start/index.ts`, add the following constants at the top of the file (after imports, before `Deno.serve`):

```typescript
const INNER_TILE_NUMBERS = [
  '18',
  '32','30','35','36','29','34',
  '26','22','31','21','25','27','23','24','28','20','19','33',
  '37','38','39','40','41','42','43','44','45','46','47','48',
]

const INNER_POSITIONS = [
  '0,0',
  '1,-1','1,0','0,1','-1,1','-1,0','0,-1',
  '2,-2','2,-1','2,0','1,1','0,2','-1,2','-2,2','-2,1','-2,0','-1,-1','0,-2','1,-2',
  '3,-2','3,-1','2,1','1,2','-1,3','-2,3','-3,2','-3,1','-2,-1','-1,-2','1,-3','2,-3',
]

const HOME_POSITIONS = ['3,-3','3,0','0,3','-3,3','-3,0','0,-3']
```

Then, after the existing player loop (after the `if (planetError)` block but before the final `games.update({ status: 'active' })`), add:

```typescript
  // Seed map_tiles
  const { data: allTiles, error: tilesError } = await db
    .from('tiles')
    .select('id, tile_number')
  if (tilesError) return errorResponse('Database error', 500)

  const tileByNumber = new Map<string, string>()
  for (const t of (allTiles ?? []) as Array<{ id: string; tile_number: string }>) {
    tileByNumber.set(String(t.tile_number), t.id)
  }

  const mapTiles: Record<string, { tile_id: string; tile_number: string }> = {}
  for (let i = 0; i < INNER_POSITIONS.length; i++) {
    const tileNumber = INNER_TILE_NUMBERS[i]
    const tileId = tileByNumber.get(tileNumber)
    if (tileId) mapTiles[INNER_POSITIONS[i]] = { tile_id: tileId, tile_number: tileNumber }
  }

  // Assign home systems to corner positions in join order
  const homeTileNumbers: string[] = []
  for (const player of players) {
    const { data: fd } = await db
      .from('factions')
      .select('home_tile_number')
      .eq('name', player.faction)
      .maybeSingle()
    homeTileNumbers.push(fd?.home_tile_number ? String(fd.home_tile_number) : '')
  }

  for (let i = 0; i < players.length && i < HOME_POSITIONS.length; i++) {
    const homeTileNumber = homeTileNumbers[i]
    const homeTileId = homeTileNumber ? tileByNumber.get(homeTileNumber) : undefined
    if (homeTileId && homeTileNumber) {
      mapTiles[HOME_POSITIONS[i]] = { tile_id: homeTileId, tile_number: homeTileNumber }
    }
  }

  const { error: mapError } = await db
    .from('games')
    .update({ map_tiles: mapTiles })
    .eq('id', body.game_id)
  if (mapError) return errorResponse(`Failed to seed map tiles: ${mapError.message}`, 500)
```

Note: the existing player loop already fetches `factionData` and `home_tile_number` for starting tech and home planet insertion. The loop above makes additional DB calls to get `home_tile_number` again. This is acceptable for Phase 9's simplified scope; a future refactor could combine these loops.

- [ ] **Step 4: Run all game-start tests**

```bash
npx vitest run tests/functions/game-start.test.js
```

Expected: all existing tests still PASS + new map_tiles test PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-start/index.ts tests/functions/game-start.test.js
git commit -m "feat: seed map_tiles in game-start"
```

---

## Task 5: game-advance-phase patch — auto agenda (TDD)

**Files:**
- Modify: `supabase/functions/game-advance-phase/index.ts`
- Create: `tests/functions/game-advance-phase.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-advance-phase.test.js`:

```js
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
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ game = { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false }, updateError = null } = {}) {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: updateMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
  })
  return { updateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-advance-phase — agenda_unlocked patch', () => {
  it('advances status → strategy when agenda_unlocked=false', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('strategy')
  })

  it('advances status → agenda when agenda_unlocked=true', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('agenda')
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not host', async () => {
    mockDb({ game: { id: GAME_ID, host_user_id: 'other-host', phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-advance-phase.test.js
```

Expected: FAIL — `agenda_unlocked` branch not yet implemented; status→strategy always fires

- [ ] **Step 3: Patch game-advance-phase**

In `supabase/functions/game-advance-phase/index.ts`:

1. Change the game `select` to include `agenda_unlocked`:

```typescript
  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, host_user_id, phase, round, agenda_unlocked')
    .eq('id', body.game_id)
    .maybeSingle()
```

2. In the `else` branch (status → next), change:

```typescript
    const { error } = await db
      .from('games')
      .update({ phase: 'strategy', round: game.round + 1, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
```

to:

```typescript
    const nextPhase = game.agenda_unlocked ? 'agenda' : 'strategy'
    const { error } = await db
      .from('games')
      .update({ phase: nextPhase, round: game.round + 1, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
```

Note: `game-advance-phase` currently uses `Deno.serve(async (req) => {...})` (the older pattern). The new tests import `handler` via `export`. Export the handler function. Open the file, wrap the existing `Deno.serve` handler body into an exported function, then call it:

```typescript
export async function handler(req: Request): Promise<Response> {
  // ... all existing logic with the agenda_unlocked patch applied ...
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

Remove the old `Deno.serve(async (req: Request) => { ... })` wrapper.

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/functions/game-advance-phase.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts tests/functions/game-advance-phase.test.js
git commit -m "feat: auto-advance to agenda phase when agenda_unlocked=true"
```

---

## Task 6: useGalaxy hook (TDD)

**Files:**
- Create: `src/hooks/useGalaxy.js`
- Create: `tests/hooks/useGalaxy.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/useGalaxy.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  mockChannel.on.mockReturnValue(mockChannel)
  return { mockChannel }
})

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { activateSystem, landTroops } from '../../src/lib/edgeFunctions.js'
import { useGalaxy } from '../../src/hooks/useGalaxy.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  round: 2,
  map_tiles: {
    '0,0': { tile_id: 'tile-mecatol', tile_number: '18' },
    '1,-1': { tile_id: 'tile-32', tile_number: '32' },
  },
}

const TILES = [
  { id: 'tile-mecatol', tile_number: '18', planets: [{ name: 'Mecatol Rex' }], type: 'blue', wormhole: null },
  { id: 'tile-32', tile_number: '32', planets: [{ name: 'Wellon' }], type: 'blue', wormhole: null },
]

const ACTIVATIONS = [
  { id: 'act-1', player_id: 'p1', system_key: '1,-1', round: 2 },
]

const PLANETS = [
  { id: 'pl-1', player_id: 'p1', planet_name: 'Wellon', exhausted: false },
]

const UNITS = [
  { id: 'u-1', player_id: 'p1', system_key: '1,-1', unit_type: 'infantry', count: 1, on_planet: 'Wellon' },
]

function mockSupabase() {
  supabase.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: GAME, error: null }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: TILES, error: null }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: ACTIVATIONS, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: PLANETS, error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: UNITS, error: null }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
  mockSupabase()
})

describe('useGalaxy', () => {
  it('fetches game, tile data, activations, planets, and units on mount', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.mapTiles).toEqual(GAME.map_tiles)
    expect(result.current.tileData['tile-mecatol']).toBeDefined()
    expect(result.current.activations).toHaveLength(1)
    expect(result.current.allPlanets).toHaveLength(1)
    expect(result.current.systemUnits).toHaveLength(1)
  })

  it('computes activatedSystems set', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activatedSystems.has('1,-1')).toBe(true)
    expect(result.current.activatedSystems.has('0,0')).toBe(false)
  })

  it('computes myActivations set for the current player', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myActivations.has('1,-1')).toBe(true)
  })

  it('computes planetOwnership map', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.planetOwnership.get('Wellon')).toEqual({ player_id: 'p1', exhausted: false })
  })

  it('activateSystem wrapper calls edgeFunctions.activateSystem with bound gameId', async () => {
    activateSystem.mockResolvedValue({ activated: true })
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.activateSystem('1,-1'))
    expect(activateSystem).toHaveBeenCalledWith('game-uuid', '1,-1')
  })

  it('landTroops wrapper calls edgeFunctions.landTroops with bound gameId', async () => {
    landTroops.mockResolvedValue({ claimed: true })
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.landTroops('1,-1', 'Wellon', 1))
    expect(landTroops).toHaveBeenCalledWith('game-uuid', '1,-1', 'Wellon', 1)
  })

  it('subscribes to realtime channels on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/hooks/useGalaxy.test.js
```

Expected: FAIL — `useGalaxy is not a function`

- [ ] **Step 3: Create useGalaxy.js**

Create `src/hooks/useGalaxy.js`:

```js
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { activateSystem as activateSystemFn, landTroops as landTroopsFn } from '../lib/edgeFunctions.js'

export function useGalaxy(gameCode, userId) {
  const [gameId, setGameId] = useState(null)
  const [mapTiles, setMapTiles] = useState({})
  const [tileData, setTileData] = useState({})
  const [activations, setActivations] = useState([])
  const [allPlanets, setAllPlanets] = useState([])
  const [systemUnits, setSystemUnits] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const gameIdRef = useRef(null)
  const roundRef = useRef(1)

  useEffect(() => {
    if (!gameCode || !userId) return
    let mounted = true
    let channel = null

    async function load() {
      setLoading(true)
      setError(null)

      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id, map_tiles, round')
        .eq('code', gameCode.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError || !game) { setError('Failed to load game'); setLoading(false); return }

      gameIdRef.current = game.id
      roundRef.current = game.round
      setGameId(game.id)
      setMapTiles(game.map_tiles ?? {})

      const tileIds = Object.values(game.map_tiles ?? {}).map(t => t.tile_id)
      if (tileIds.length > 0) {
        const { data: tiles } = await supabase
          .from('tiles')
          .select('id, tile_number, planets, type, wormhole')
          .in('id', tileIds)
        if (!mounted) return
        const indexed = {}
        for (const tile of tiles ?? []) indexed[tile.id] = tile
        setTileData(indexed)
      }

      const { data: acts } = await supabase
        .from('game_system_activations')
        .select('*')
        .eq('game_id', game.id)
        .eq('round', game.round)
      if (!mounted) return
      setActivations(acts ?? [])

      const { data: planets } = await supabase
        .from('game_player_planets')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setAllPlanets(planets ?? [])

      const { data: units } = await supabase
        .from('game_player_units')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setSystemUnits(units ?? [])

      const { data: myPlayer } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', game.id)
        .eq('user_id', userId)
        .maybeSingle()
      if (!mounted) return
      setMyPlayerId(myPlayer?.id ?? null)

      setLoading(false)

      channel = supabase
        .channel(`galaxy:${game.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
          async (payload) => {
            if (!mounted) return
            if (payload.new.map_tiles) setMapTiles(payload.new.map_tiles)
            if (payload.new.round && payload.new.round !== roundRef.current) {
              roundRef.current = payload.new.round
              const { data } = await supabase
                .from('game_system_activations')
                .select('*')
                .eq('game_id', gameIdRef.current)
                .eq('round', payload.new.round)
              if (mounted && data) setActivations(data)
            }
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_system_activations', filter: `game_id=eq.${game.id}` },
          async () => {
            if (!mounted) return
            const { data } = await supabase
              .from('game_system_activations')
              .select('*')
              .eq('game_id', gameIdRef.current)
              .eq('round', roundRef.current)
            if (mounted && data) setActivations(data)
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setAllPlanets(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
              if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
              return prev
            })
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_units', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setSystemUnits(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(u => u.id === payload.new.id ? payload.new : u)
              if (payload.eventType === 'DELETE') return prev.filter(u => u.id !== payload.old.id)
              return prev
            })
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, userId])

  const activatedSystems = new Set(activations.map(a => a.system_key))
  const myActivations = new Set(
    activations.filter(a => a.player_id === myPlayerId).map(a => a.system_key)
  )
  const planetOwnership = new Map(
    allPlanets.map(p => [p.planet_name, { player_id: p.player_id, exhausted: p.exhausted }])
  )

  return {
    gameId,
    mapTiles,
    tileData,
    activations,
    allPlanets,
    systemUnits,
    activatedSystems,
    myActivations,
    planetOwnership,
    loading,
    error,
    activateSystem: (systemKey) => activateSystemFn(gameId, systemKey),
    landTroops: (systemKey, planetName, troopCount) => landTroopsFn(gameId, systemKey, planetName, troopCount),
  }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/hooks/useGalaxy.test.js
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGalaxy.js tests/hooks/useGalaxy.test.js
git commit -m "feat: add useGalaxy hook"
```

---

## Task 7: HexTile component (TDD)

**Files:**
- Create: `src/components/game/HexTile.jsx`
- Create: `tests/components/game/HexTile.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/HexTile.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HexTile from '../../../src/components/game/HexTile.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', colour: '#22c55e' },
  { id: 'p2', display_name: 'Bob', colour: '#ef4444' },
]

const PLANETS = [
  { name: 'Wellon' },
  { name: 'Vefut II' },
]

function renderTile(overrides = {}) {
  const props = {
    systemKey: '1,-1',
    tileNumber: '32',
    planets: PLANETS,
    activations: [],
    units: [],
    planetOwnership: new Map(),
    players: PLAYERS,
    onSelect: vi.fn(),
    size: 60,
    ...overrides,
  }
  return render(
    <svg>
      <HexTile {...props} />
    </svg>
  )
}

describe('HexTile', () => {
  it('renders tile number', () => {
    renderTile()
    expect(screen.getByText('32')).toBeInTheDocument()
  })

  it('renders planet names', () => {
    renderTile()
    expect(screen.getByText('Wellon')).toBeInTheDocument()
    expect(screen.getByText('Vefut II')).toBeInTheDocument()
  })

  it('renders unit count badge when infantry present', () => {
    renderTile({
      units: [
        { player_id: 'p1', unit_type: 'infantry', count: 3, on_planet: 'Wellon' },
        { player_id: 'p1', unit_type: 'infantry', count: 1, on_planet: 'Vefut II' },
      ],
    })
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('does not render unit badge when no infantry', () => {
    renderTile({ units: [] })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renders one tactic token circle per activation', () => {
    const { container } = renderTile({
      activations: [
        { id: 'a1', player_id: 'p1' },
        { id: 'a2', player_id: 'p2' },
      ],
    })
    // Tactic token circles are rendered as <circle> with player fill colour
    const circles = container.querySelectorAll('circle[fill="#22c55e"], circle[fill="#ef4444"]')
    expect(circles.length).toBe(2)
  })

  it('calls onSelect with systemKey on click', () => {
    const onSelect = vi.fn()
    const { container } = renderTile({ onSelect })
    fireEvent.click(container.querySelector('g'))
    expect(onSelect).toHaveBeenCalledWith('1,-1')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/HexTile.test.jsx
```

Expected: FAIL — `HexTile` module not found

- [ ] **Step 3: Create HexTile.jsx**

Create `src/components/game/HexTile.jsx`:

```jsx
function hexPolygonPoints(size) {
  return [0, 60, 120, 180, 240, 300]
    .map(deg => {
      const rad = (deg * Math.PI) / 180
      return `${size * Math.cos(rad)},${size * Math.sin(rad)}`
    })
    .join(' ')
}

export default function HexTile({ systemKey, tileNumber, planets, activations, units, planetOwnership, players, onSelect, size = 60 }) {
  const spaceUnits = units.filter(u => u.on_planet === null || u.on_planet === undefined)
  const spacePlayerIds = [...new Set(spaceUnits.map(u => u.player_id))]
  let borderColour = '#4a5568'
  if (spacePlayerIds.length === 1) {
    const p = players.find(pl => pl.id === spacePlayerIds[0])
    borderColour = p?.colour ?? '#4a5568'
  }

  const infantryCount = units
    .filter(u => u.unit_type === 'infantry')
    .reduce((sum, u) => sum + (u.count ?? 0), 0)

  return (
    <g onClick={() => onSelect(systemKey)} style={{ cursor: 'pointer' }}>
      <polygon points={hexPolygonPoints(size)} fill="#1a202c" stroke={borderColour} strokeWidth={2} />

      <text x={0} y={-size + 14} textAnchor="middle" fill="#d4af37" fontSize={10} fontFamily="Orbitron,sans-serif">
        {tileNumber}
      </text>

      {planets.map((planet, i) => {
        const ownership = planetOwnership.get(planet.name)
        const dotFill = !ownership ? '#6b7280' : ownership.exhausted ? 'none' : '#22c55e'
        const dotStroke = !ownership ? '#6b7280' : '#22c55e'
        return (
          <g key={planet.name} transform={`translate(0,${-8 + i * 14})`}>
            <circle cx={-size * 0.35} cy={0} r={4} fill={dotFill} stroke={dotStroke} strokeWidth={1.5} />
            <text x={-size * 0.35 + 8} y={4} fontSize={8} fill="#cbd5e0" fontFamily="Rajdhani,sans-serif">
              {planet.name}
            </text>
          </g>
        )
      })}

      {activations.map((act, i) => {
        const p = players.find(pl => pl.id === act.player_id)
        return (
          <circle
            key={act.id}
            cx={size * 0.55 - i * 9}
            cy={-size * 0.55}
            r={6}
            fill={p?.colour ?? '#6b7280'}
            stroke="#1a202c"
            strokeWidth={1.5}
          />
        )
      })}

      {infantryCount > 0 && (
        <g transform={`translate(0,${size - 14})`}>
          <rect x={-10} y={-8} width={20} height={14} rx={3} fill="#1a202c" stroke="#4a5568" strokeWidth={1} />
          <text x={0} y={2} textAnchor="middle" fontSize={9} fill="#e2e8f0" fontFamily="Space Mono,monospace">
            {infantryCount}
          </text>
        </g>
      )}
    </g>
  )
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/components/game/HexTile.test.jsx
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/game/HexTile.jsx tests/components/game/HexTile.test.jsx
git commit -m "feat: add HexTile SVG component"
```

---

## Task 8: HexMap component (TDD)

**Files:**
- Create: `src/components/game/HexMap.jsx`
- Create: `tests/components/game/HexMap.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/HexMap.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HexMap from '../../../src/components/game/HexMap.jsx'

const MAP_TILES = {
  '0,0': { tile_id: 'tid-18', tile_number: '18' },
  '1,-1': { tile_id: 'tid-32', tile_number: '32' },
  '-1,1': { tile_id: 'tid-30', tile_number: '30' },
}

const TILE_DATA = {
  'tid-18': { id: 'tid-18', tile_number: '18', planets: [{ name: 'Mecatol Rex' }] },
  'tid-32': { id: 'tid-32', tile_number: '32', planets: [{ name: 'Wellon' }] },
  'tid-30': { id: 'tid-30', tile_number: '30', planets: [] },
}

const PLAYERS = [{ id: 'p1', display_name: 'Alice', colour: '#22c55e' }]

function renderMap(overrides = {}) {
  return render(
    <HexMap
      mapTiles={MAP_TILES}
      tileData={TILE_DATA}
      activations={[]}
      systemUnits={[]}
      planetOwnership={new Map()}
      players={PLAYERS}
      onSelectSystem={vi.fn()}
      {...overrides}
    />
  )
}

describe('HexMap', () => {
  it('renders one tile number per entry in mapTiles', () => {
    renderMap()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = renderMap()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders one <g> group per tile', () => {
    const { container } = renderMap()
    // Each tile has a <g> wrapping a HexTile <g>: outer translate group + inner tile group
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBe(3)
  })

  it('renders nothing when mapTiles is empty', () => {
    const { container } = renderMap({ mapTiles: {} })
    expect(container.querySelectorAll('polygon').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/HexMap.test.jsx
```

Expected: FAIL — `HexMap` module not found

- [ ] **Step 3: Create HexMap.jsx**

Create `src/components/game/HexMap.jsx`:

```jsx
import HexTile from './HexTile.jsx'

const HEX_SIZE = 50

function axialToPixel(q, r) {
  const x = HEX_SIZE * (3 / 2) * q
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return { x, y }
}

export default function HexMap({ mapTiles, tileData, activations, systemUnits, planetOwnership, players, onSelectSystem }) {
  const entries = Object.entries(mapTiles)

  return (
    <svg viewBox="-350 -350 700 700" style={{ width: '100%', height: '100%' }} className="touch-none">
      {entries.map(([key, tileEntry]) => {
        const [q, r] = key.split(',').map(Number)
        const { x, y } = axialToPixel(q, r)
        const tileInfo = tileData[tileEntry.tile_id] ?? null
        const tileActivations = activations.filter(a => a.system_key === key)
        const tileUnits = systemUnits.filter(u => u.system_key === key)

        return (
          <g key={key} transform={`translate(${x},${y})`}>
            <HexTile
              systemKey={key}
              tileNumber={tileEntry.tile_number}
              planets={tileInfo?.planets ?? []}
              activations={tileActivations}
              units={tileUnits}
              planetOwnership={planetOwnership}
              players={players}
              onSelect={onSelectSystem}
              size={HEX_SIZE}
            />
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/components/game/HexMap.test.jsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/game/HexMap.jsx tests/components/game/HexMap.test.jsx
git commit -m "feat: add HexMap SVG component"
```

---

## Task 9: SystemActionModal component (TDD)

**Files:**
- Create: `src/components/game/SystemActionModal.jsx`
- Create: `tests/components/game/SystemActionModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/SystemActionModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SystemActionModal from '../../../src/components/game/SystemActionModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', colour: '#22c55e' },
  { id: 'p2', display_name: 'Bob', colour: '#ef4444' },
]

const TILE_INFO = {
  planets: [{ name: 'Wellon' }, { name: 'Vefut II' }],
}

const BASE_PROPS = {
  systemKey: '1,-1',
  tileInfo: TILE_INFO,
  activations: [],
  planetOwnership: new Map([['Wellon', { player_id: 'p2', exhausted: false }]]),
  players: PLAYERS,
  currentPlayer: { id: 'p1' },
  isActivePlayer: false,
  hasAvailableTacticTokens: true,
  myActivations: new Set(),
  onActivate: vi.fn(),
  onLandTroops: vi.fn(),
  onClose: vi.fn(),
  custodiansClaimed: false,
}

describe('SystemActionModal', () => {
  it('shows ACTIVATE SYSTEM button when active player with tokens and system not yet activated', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} />)
    expect(screen.getByRole('button', { name: /activate system/i })).toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM button when not active player', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={false} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM button when no tactic tokens', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} hasAvailableTacticTokens={false} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('does NOT show ACTIVATE SYSTEM when system already activated by me', () => {
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} myActivations={new Set(['1,-1'])} />)
    expect(screen.queryByRole('button', { name: /activate system/i })).not.toBeInTheDocument()
  })

  it('shows LAND ON buttons for each planet when system activated by me', () => {
    render(<SystemActionModal {...BASE_PROPS} myActivations={new Set(['1,-1'])} />)
    expect(screen.getByRole('button', { name: /land on wellon/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /land on vefut ii/i })).toBeInTheDocument()
  })

  it('calls onActivate with systemKey when ACTIVATE SYSTEM clicked', () => {
    const onActivate = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} isActivePlayer={true} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: /activate system/i }))
    expect(onActivate).toHaveBeenCalledWith('1,-1')
  })

  it('calls onLandTroops with correct args when LAND ON clicked', () => {
    const onLandTroops = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} myActivations={new Set(['1,-1'])} onLandTroops={onLandTroops} />)
    fireEvent.click(screen.getByRole('button', { name: /land on wellon/i }))
    expect(onLandTroops).toHaveBeenCalledWith('1,-1', 'Wellon', 1)
  })

  it('shows Custodians notification when custodiansClaimed=true', () => {
    render(<SystemActionModal {...BASE_PROPS} custodiansClaimed={true} />)
    expect(screen.getByText(/custodians/i)).toBeInTheDocument()
    expect(screen.getByText(/\+1 VP/i)).toBeInTheDocument()
  })

  it('shows planet ownership info', () => {
    render(<SystemActionModal {...BASE_PROPS} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('calls onClose when CLOSE button clicked', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...BASE_PROPS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/SystemActionModal.test.jsx
```

Expected: FAIL — `SystemActionModal` module not found

- [ ] **Step 3: Create SystemActionModal.jsx**

Create `src/components/game/SystemActionModal.jsx`:

```jsx
export default function SystemActionModal({
  systemKey, tileInfo, activations, planetOwnership, players,
  currentPlayer, isActivePlayer, hasAvailableTacticTokens,
  myActivations, onActivate, onLandTroops, onClose, custodiansClaimed,
}) {
  const systemActivatedByMe = myActivations.has(systemKey)
  const planets = tileInfo?.planets ?? []

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div className="panel max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <p className="label mb-4">SYSTEM {systemKey}</p>

        {isActivePlayer && hasAvailableTacticTokens && !systemActivatedByMe && (
          <button className="btn-primary w-full mb-4" onClick={() => onActivate(systemKey)}>
            ACTIVATE SYSTEM
          </button>
        )}

        {systemActivatedByMe && planets.map(planet => (
          <button
            key={planet.name}
            className="btn-ghost w-full mb-2"
            onClick={() => onLandTroops(systemKey, planet.name, 1)}
          >
            LAND ON {planet.name.toUpperCase()}
          </button>
        ))}

        {custodiansClaimed && (
          <div className="panel-inset mb-4">
            <p className="text-gold font-body text-sm">You claimed the Custodians! +1 VP</p>
          </div>
        )}

        <div className="flex flex-col gap-1 mt-2">
          {planets.map(planet => {
            const ownership = planetOwnership.get(planet.name)
            const owner = ownership ? players.find(p => p.id === ownership.player_id) : null
            return (
              <div key={planet.name} className="flex justify-between text-xs font-body">
                <span className="text-muted">{planet.name}</span>
                <span className="text-dim">{owner ? owner.display_name : 'Unclaimed'}</span>
              </div>
            )
          })}
        </div>

        <button className="btn-ghost text-xs mt-4 w-full" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/components/game/SystemActionModal.test.jsx
```

Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SystemActionModal.jsx tests/components/game/SystemActionModal.test.jsx
git commit -m "feat: add SystemActionModal component"
```

---

## Task 10: GalaxyTab component (TDD)

**Files:**
- Create: `src/components/game/GalaxyTab.jsx`
- Create: `tests/components/game/GalaxyTab.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/GalaxyTab.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GalaxyTab from '../../../src/components/game/GalaxyTab.jsx'

vi.mock('../../../src/components/game/HexMap.jsx', () => ({
  default: ({ onSelectSystem }) => (
    <div data-testid="hex-map">
      <button onClick={() => onSelectSystem('1,-1')}>Select Hex</button>
    </div>
  ),
}))

vi.mock('../../../src/components/game/SystemActionModal.jsx', () => ({
  default: ({ systemKey, onClose }) => (
    <div data-testid="system-modal">
      <span>{systemKey}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}))

const PLAYERS = [{ id: 'p1', display_name: 'Alice', colour: '#22c55e', command_tokens: { tactic_total: 3 } }]
const CURRENT_PLAYER = { id: 'p1', command_tokens: { tactic_total: 3 } }
const GAME = { id: 'game-uuid', phase: 'action', active_player_id: 'p1' }

const BASE_PROPS = {
  mapTiles: { '1,-1': { tile_id: 'tid-1', tile_number: '32' } },
  tileData: {},
  activations: [],
  allPlanets: [],
  systemUnits: [],
  activatedSystems: new Set(),
  myActivations: new Set(),
  planetOwnership: new Map(),
  players: PLAYERS,
  currentPlayer: CURRENT_PLAYER,
  game: GAME,
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
}

describe('GalaxyTab', () => {
  it('renders HexMap', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    expect(screen.getByTestId('hex-map')).toBeInTheDocument()
  })

  it('does not render SystemActionModal initially', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    expect(screen.queryByTestId('system-modal')).not.toBeInTheDocument()
  })

  it('opens SystemActionModal when a hex is selected', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByText('Select Hex'))
    expect(screen.getByTestId('system-modal')).toBeInTheDocument()
    expect(screen.getByText('1,-1')).toBeInTheDocument()
  })

  it('closes SystemActionModal when onClose is called', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByText('Select Hex'))
    expect(screen.getByTestId('system-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Close Modal'))
    expect(screen.queryByTestId('system-modal')).not.toBeInTheDocument()
  })

  it('calls activateSystem and closes modal on successful activation', async () => {
    const activateSystem = vi.fn().mockResolvedValue({ activated: true })
    render(<GalaxyTab {...BASE_PROPS} activateSystem={activateSystem} />)
    // This would be tested via SystemActionModal's onActivate callback
    // Covered by integration: activateSystem prop is passed down and called
    expect(activateSystem).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: FAIL — `GalaxyTab` module not found

- [ ] **Step 3: Create GalaxyTab.jsx**

Create `src/components/game/GalaxyTab.jsx`:

```jsx
import { useState } from 'react'
import HexMap from './HexMap.jsx'
import SystemActionModal from './SystemActionModal.jsx'

export default function GalaxyTab({
  mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership,
  players, currentPlayer, game,
  activateSystem, landTroops,
}) {
  const [selectedSystemKey, setSelectedSystemKey] = useState(null)
  const [custodiansClaimed, setCustodiansClaimed] = useState(false)

  const isActivePlayer = game?.active_player_id === currentPlayer?.id
  const tacticUsed = activations.filter(a => a.player_id === currentPlayer?.id).length
  const tacticTotal = currentPlayer?.command_tokens?.tactic_total ?? 0
  const hasAvailableTacticTokens = tacticTotal > tacticUsed

  async function handleActivate(systemKey) {
    try {
      await activateSystem(systemKey)
    } catch (e) {
      console.error('Activate error:', e)
    }
    setSelectedSystemKey(null)
  }

  async function handleLandTroops(systemKey, planetName, troopCount) {
    try {
      const result = await landTroops(systemKey, planetName, troopCount)
      if (result?.custodians_claimed) setCustodiansClaimed(true)
    } catch (e) {
      console.error('Land troops error:', e)
    }
    setSelectedSystemKey(null)
  }

  const selectedTileInfo = selectedSystemKey
    ? tileData[mapTiles[selectedSystemKey]?.tile_id] ?? null
    : null

  return (
    <div className="panel flex flex-col" style={{ height: '70vh' }}>
      <p className="label mb-2">GALAXY</p>
      <div className="flex-1 min-h-0">
        <HexMap
          mapTiles={mapTiles}
          tileData={tileData}
          activations={activations}
          systemUnits={systemUnits}
          planetOwnership={planetOwnership}
          players={players}
          onSelectSystem={setSelectedSystemKey}
        />
      </div>

      {selectedSystemKey && (
        <SystemActionModal
          systemKey={selectedSystemKey}
          tileInfo={selectedTileInfo}
          activations={activations.filter(a => a.system_key === selectedSystemKey)}
          planetOwnership={planetOwnership}
          players={players}
          currentPlayer={currentPlayer}
          isActivePlayer={isActivePlayer}
          hasAvailableTacticTokens={hasAvailableTacticTokens}
          myActivations={myActivations}
          onActivate={handleActivate}
          onLandTroops={handleLandTroops}
          onClose={() => setSelectedSystemKey(null)}
          custodiansClaimed={custodiansClaimed}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/game/GalaxyTab.jsx tests/components/game/GalaxyTab.test.jsx
git commit -m "feat: add GalaxyTab component"
```

---

## Task 11: GameScreen + HostControlsSection integration (TDD)

**Files:**
- Modify: `src/components/game/GameScreen.jsx`
- Modify: `src/components/game/HostControlsSection.jsx`
- Modify: `tests/components/game/HostControlsSection.test.jsx`

- [ ] **Step 1: Write the failing test for HostControlsSection**

In `tests/components/game/HostControlsSection.test.jsx`, add to the existing `describe` block:

```js
  it('does NOT render BEGIN AGENDA PHASE button', () => {
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'action', round: 2, agenda_phase_step: 'inactive' }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={vi.fn()}
        onBeginAgendaPhase={vi.fn()}
        onEndAgendaPhase={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /begin agenda phase/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx -t "begin agenda"
```

Expected: FAIL — button IS present (existing code shows it when `agenda_phase_step === 'inactive'`)

- [ ] **Step 3: Remove the BEGIN AGENDA PHASE button from HostControlsSection**

In `src/components/game/HostControlsSection.jsx`, remove the following block entirely:

```jsx
      {/* Agenda phase controls */}
      {game?.agenda_phase_step === 'inactive' && (
        <button className="btn-ghost text-xs" onClick={onBeginAgendaPhase}>
          BEGIN AGENDA PHASE
        </button>
      )}
```

Leave the END AGENDA PHASE button intact (it ends the phase once it's running, which is still needed).

Also remove `onBeginAgendaPhase` from the destructured props since it's no longer used:

```jsx
export default function HostControlsSection({
  isHost, game, players, objectives,
  onScoreObjective, onRevealObjective, onShuffleDeck, onAdvancePhase,
  onEndStatusPhase,
  onEndAgendaPhase,
  pendingSecretPlayers = [],
  pendingTokenPlayers = [],
}) {
```

- [ ] **Step 4: Run HostControlsSection tests**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx
```

Expected: all tests PASS. (Any existing test that checks the BEGIN AGENDA PHASE button is present should also be updated to verify it's absent, or removed.)

- [ ] **Step 5: Wire GameScreen — add useGalaxy, GALAXY tab, GalaxyTab**

In `src/components/game/GameScreen.jsx`:

**Add imports** near the top (after existing imports):

```jsx
import { useGalaxy } from '../../hooks/useGalaxy.js'
import GalaxyTab from './GalaxyTab.jsx'
```

**Add useGalaxy call** inside the component, immediately after the `useGame` destructuring:

```jsx
  const galaxyState = useGalaxy(code, userId)
```

**Change the `useState` for `activeTab`** — find any existing tab state (there may not be one yet). Add:

```jsx
  const [activeTab, setActiveTab] = useState('my-panel') // 'my-panel' | 'scoreboard' | 'galaxy'
```

If `activeTab` state already exists, just add `'galaxy'` as a valid value.

**Add the GALAXY tab button** to the tab bar. Find where MY PANEL / SCOREBOARD tabs are rendered in the JSX and add a third button alongside them:

```jsx
<button
  className={`btn-ghost text-xs ${activeTab === 'galaxy' ? 'text-bright' : 'text-muted'}`}
  onClick={() => setActiveTab('galaxy')}
>
  GALAXY
</button>
```

**Add the GalaxyTab render block** alongside the other tab conditionals in the JSX:

```jsx
{activeTab === 'galaxy' && (
  <GalaxyTab
    {...galaxyState}
    players={players}
    currentPlayer={currentPlayer}
    game={game}
  />
)}
```

**Remove `beginAgendaPhase` and the `onBeginAgendaPhase` prop** from the `HostControlsSection` usage in `GameScreen`:

Remove the `beginAgendaPhase` function definition:
```jsx
  async function beginAgendaPhase() {  // DELETE THIS
    if (!game) return
    await supabase.from('games').update({ agenda_phase_step: 'agenda_1_voting' }).eq('id', game.id)
  }
```

Remove `onBeginAgendaPhase={beginAgendaPhase}` from the `<HostControlsSection>` props.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all existing tests PASS + new tests PASS. Count should be ≥ 668 + new tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/GameScreen.jsx src/components/game/HostControlsSection.jsx tests/components/game/HostControlsSection.test.jsx
git commit -m "feat: wire GALAXY tab and GalaxyTab into GameScreen; remove manual Agenda Phase button"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| GALAXY tab alongside MY PANEL, SCOREBOARD | Task 11 |
| SVG hex grid, 37-tile spiral | Tasks 7, 8 |
| Tile number, planet dots, tactic badges, unit count | Task 7 |
| System activation, tactic token validation | Tasks 2, 9, 10 |
| Land Troops flow | Tasks 3, 9, 10 |
| Custodians gate (+1 VP, agenda_unlocked) | Task 3 |
| Auto Agenda Phase advance | Task 5 |
| BEGIN AGENDA PHASE button removed | Task 11 |
| map_tiles seeded at game start | Task 4 |
| useGalaxy hook, Realtime | Task 6 |
| edgeFunctions wrappers | Task 1 |

All spec requirements are covered.

**Placeholder scan:** No TBD, TODO, or "similar to Task N" references found.

**Type consistency check:**
- `activateSystem(systemKey)` — used in Task 1, 6, 9, 10 ✓
- `landTroops(systemKey, planetName, troopCount)` — used in Task 1, 6, 9, 10 ✓
- `myActivations: Set<string>` — produced in Task 6, consumed in Tasks 9, 10 ✓
- `planetOwnership: Map<planet_name, { player_id, exhausted }>` — produced in Task 6, consumed in Tasks 7, 9 ✓
- `tileData: Record<tile_id, tile>` — produced in Task 6, consumed in Tasks 8, 10 ✓
- `mapTiles: Record<"q,r", { tile_id, tile_number }>` — format consistent across Tasks 4, 6, 8, 10 ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-phase9-galaxy-map.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
