# Phase 2: Session Creation & Lobby — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the game creation, joining, and lobby flow — from creating a game through faction/color picks and host configuration to "Start Game" transitioning all clients to the in-game placeholder.

**Architecture:** Six Edge Functions handle all lobby mutations (game-create, game-join, game-update-settings, game-pick-faction-color, game-set-speaker, game-start). A `useGame` hook owns game state and Supabase Realtime subscriptions. `SetupScreen`, `LobbyScreen`, and `GamePlaceholder` replace the Phase 1 placeholders in `App.jsx`. All follow Phase 1 patterns: Edge Functions with `requireAuth` + `db`, Vitest unit tests mocking at the module boundary.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v7, Vitest 4, @testing-library/react, TypeScript/Deno (Edge Functions), Supabase CLI

---

## File Map

**Modified:**
- `ti4-companion-web/src/lib/edgeFunctions.js` — add 6 typed wrappers: `createGame`, `joinGame`, `updateGameSettings`, `pickFactionColor`, `setSpeaker`, `startGame`
- `ti4-companion-web/src/App.jsx` — add `/join/:code`, `/lobby/:code`, `/game/:code` routes; replace `SetupPlaceholder` with `SetupScreen`; remove `DashboardPlaceholder` and `/dashboard`; add inline `JoinRedirect` component

**Created (Edge Functions):**
- `supabase/functions/game-create/index.ts`
- `supabase/functions/game-join/index.ts`
- `supabase/functions/game-update-settings/index.ts`
- `supabase/functions/game-pick-faction-color/index.ts`
- `supabase/functions/game-set-speaker/index.ts`
- `supabase/functions/game-start/index.ts`

**Created (React):**
- `ti4-companion-web/src/hooks/useGame.js`
- `ti4-companion-web/src/components/game/SetupScreen.jsx`
- `ti4-companion-web/src/components/game/LobbyScreen.jsx`
- `ti4-companion-web/src/components/game/GamePlaceholder.jsx`

**Created (Tests):**
- `ti4-companion-web/tests/lib/edgeFunctions.game.test.js`
- `ti4-companion-web/tests/functions/game-create.test.js`
- `ti4-companion-web/tests/functions/game-join.test.js`
- `ti4-companion-web/tests/functions/game-update-settings.test.js`
- `ti4-companion-web/tests/functions/game-pick-faction-color.test.js`
- `ti4-companion-web/tests/functions/game-set-speaker.test.js`
- `ti4-companion-web/tests/functions/game-start.test.js`
- `ti4-companion-web/tests/hooks/useGame.test.js`
- `ti4-companion-web/tests/components/game/SetupScreen.test.jsx`
- `ti4-companion-web/tests/components/game/LobbyScreen.test.jsx`

---

## Task 0: edgeFunctions.js — game wrappers

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.game.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/lib/edgeFunctions.game.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  createGame,
  joinGame,
  updateGameSettings,
  pickFactionColor,
  setSpeaker,
  startGame,
} from '../../src/lib/edgeFunctions.js'

describe('game edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createGame calls game-create with empty body', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { code: 'ABC123', game_id: 'g1' }, error: null })
    const result = await createGame()
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-create', { body: {} })
    expect(result).toEqual({ code: 'ABC123', game_id: 'g1' })
  })

  it('joinGame calls game-join with code', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { game_id: 'g1', code: 'ABC123' }, error: null })
    await joinGame('ABC123')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-join', { body: { code: 'ABC123' } })
  })

  it('updateGameSettings spreads game_id and settings', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await updateGameSettings('g1', { vp_goal: 14 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-update-settings', {
      body: { game_id: 'g1', vp_goal: 14 },
    })
  })

  it('pickFactionColor calls game-pick-faction-color', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await pickFactionColor('g1', 'Arborec', 'green')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-pick-faction-color', {
      body: { game_id: 'g1', faction: 'Arborec', colour: 'green' },
    })
  })

  it('setSpeaker calls game-set-speaker', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await setSpeaker('g1', 'player-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-set-speaker', {
      body: { game_id: 'g1', player_id: 'player-uuid' },
    })
  })

  it('startGame calls game-start', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { started: true }, error: null })
    await startGame('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-start', { body: { game_id: 'g1' } })
  })

  it('throws when any wrapper receives an error response', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } })
    await expect(createGame()).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/lib/edgeFunctions.game.test.js
```

Expected: FAIL — `createGame is not a function` (or similar)

- [ ] **Step 3: Add the 6 wrappers to edgeFunctions.js**

Append to `ti4-companion-web/src/lib/edgeFunctions.js` (keep the existing `importTable` and `callFunction` exports):

```js
export const createGame = () =>
  callFunction('game-create', {})

export const joinGame = (code) =>
  callFunction('game-join', { code })

export const updateGameSettings = (gameId, settings) =>
  callFunction('game-update-settings', { game_id: gameId, ...settings })

export const pickFactionColor = (gameId, faction, colour) =>
  callFunction('game-pick-faction-color', { game_id: gameId, faction, colour })

export const setSpeaker = (gameId, playerId) =>
  callFunction('game-set-speaker', { game_id: gameId, player_id: playerId })

export const startGame = (gameId) =>
  callFunction('game-start', { game_id: gameId })
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/edgeFunctions.game.test.js
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add ti4-companion-web/src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.game.test.js
git commit -m "feat: add game lobby edge function wrappers to edgeFunctions.js"
```

---

## Task 1: game-create Edge Function

**Files:**
- Create: `supabase/functions/game-create/index.ts`
- Create: `ti4-companion-web/tests/functions/game-create.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-create.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

function makeRequest(body = {}) {
  return new Request('http://localhost/game-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// Sets up db.from to return appropriate mocks for each table
function mockDb({
  profileData = { display_name: 'Test User' },
  profileError = null,
  gameData = { id: 'game-uuid', code: 'ABC123' },
  gameError = null,
  playerError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData, error: profileError }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }), // no collision
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        insert: vi.fn().mockResolvedValue({ error: playerError }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-create/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('game-create', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('returns 204 for OPTIONS preflight', async () => {
    const req = new Request('http://localhost/game-create', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 200 with code and game_id on success', async () => {
    requireAuth.mockResolvedValue('user-uuid')
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('ABC123')
    expect(body.game_id).toBe('game-uuid')
  })

  it('returns 500 when game insert fails', async () => {
    requireAuth.mockResolvedValue('user-uuid')
    mockDb({ gameError: { message: 'unique violation' } })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/failed to create game/i)
  })

  it('returns 500 when game_players insert fails', async () => {
    requireAuth.mockResolvedValue('user-uuid')
    mockDb({ playerError: { message: 'constraint violation' } })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/failed to add host player/i)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-create.test.js
```

Expected: FAIL — module not found or handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-create/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  // Fetch host's display name
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single()
  if (profileError) return errorResponse('Could not fetch profile', 500)

  // Generate a unique 6-char room code
  let code = generateCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await db
      .from('games')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!existing) break
    code = generateCode()
  }

  // Insert the game
  const { data: game, error: gameError } = await db
    .from('games')
    .insert({
      code,
      host_user_id: userId,
      phase: 'strategy',
      round: 1,
      vp_goal: 10,
      permissions_mode: 'host',
      expansions: { base: true, pok: false, te: false },
      status: 'lobby',
    })
    .select('id, code')
    .single()
  if (gameError) return errorResponse(`Failed to create game: ${gameError.message}`, 500)

  // Add the host as the first player
  const { error: playerError } = await db
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      display_name: profile?.display_name ?? 'Unknown',
      seat_index: 0,
      vp: 0,
      command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
      commodities: 0,
      trade_goods: 0,
    })
  if (playerError) return errorResponse(`Failed to add host player: ${playerError.message}`, 500)

  return okResponse({ code: game.code, game_id: game.id })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-create.test.js
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add supabase/functions/game-create/ ti4-companion-web/tests/functions/game-create.test.js
git commit -m "feat: add game-create edge function"
```

---

## Task 2: game-join Edge Function

**Files:**
- Create: `supabase/functions/game-join/index.ts`
- Create: `ti4-companion-web/tests/functions/game-join.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-join.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  gameData = { id: GAME_ID, status: 'lobby' },
  gameError = null,
  existingPlayer = null,   // null = not already in game
  playerCount = 1,
  countError = null,
  profileData = { display_name: 'Test User' },
  playerError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols, opts) => {
          if (opts?.count === 'exact') {
            // count query: .select('*', {count:'exact',head:true}).eq('game_id',...) → {count, error}
            return {
              eq: vi.fn().mockResolvedValue({ count: playerCount, error: countError }),
            }
          }
          // membership check: .select('id').eq('game_id',...).eq('user_id',...).maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingPlayer }),
              }),
            }),
          }
        }),
        insert: vi.fn().mockResolvedValue({ error: playerError }),
      }
    }
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData }),
          }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-join/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-join', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when code is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/'code' must be a non-empty string/)
  })

  it('returns 404 when game code does not exist', async () => {
    mockDb({ gameData: null })
    const res = await handler(makeRequest({ code: 'XXXXXX' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 409 when game has already started', async () => {
    mockDb({ gameData: { id: GAME_ID, status: 'active' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already started/i)
  })

  it('returns 200 idempotently when player is already in the game', async () => {
    mockDb({ existingPlayer: { id: 'player-uuid' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.game_id).toBe(GAME_ID)
  })

  it('returns 409 when game is full (8 players)', async () => {
    mockDb({ playerCount: 8 })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/full/i)
  })

  it('returns 200 with game_id and code on successful join', async () => {
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.game_id).toBe(GAME_ID)
    expect(body.code).toBe('ABC123')
  })

  it('returns 500 when insert fails', async () => {
    mockDb({ playerError: { message: 'constraint' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-join.test.js
```

Expected: FAIL — handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-join/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { code?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.code || typeof body.code !== 'string') {
    return errorResponse("'code' must be a non-empty string")
  }

  const code = body.code.toUpperCase().trim()

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, status')
    .eq('code', code)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.status !== 'lobby') return errorResponse('Game has already started or ended', 409)

  // Idempotent: if caller already has a row, succeed immediately
  const { data: existing } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return okResponse({ game_id: game.id, code })

  // Check capacity
  const { count, error: countError } = await db
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', game.id)
  if (countError) return errorResponse('Database error', 500)
  if ((count ?? 0) >= 8) return errorResponse('Game is full (maximum 8 players)', 409)

  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single()

  const { error: insertError } = await db
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      display_name: profile?.display_name ?? 'Unknown',
      seat_index: count ?? 0,
      vp: 0,
      command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
      commodities: 0,
      trade_goods: 0,
    })
  if (insertError) return errorResponse(`Failed to join game: ${insertError.message}`, 500)

  return okResponse({ game_id: game.id, code })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-join.test.js
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add supabase/functions/game-join/ ti4-companion-web/tests/functions/game-join.test.js
git commit -m "feat: add game-join edge function"
```

---

## Task 3: game-update-settings Edge Function

**Files:**
- Create: `supabase/functions/game-update-settings/index.ts`
- Create: `ti4-companion-web/tests/functions/game-update-settings.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-update-settings.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-update-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby' },
  gameError = null,
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-update-settings/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-update-settings', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ vp_goal: 14 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when game is not in lobby', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'active' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when vp_goal is not a positive integer', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: -1 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/vp_goal/)
  })

  it('returns 400 when permissions_mode is invalid', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, permissions_mode: 'invalid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/permissions_mode/)
  })

  it('returns 200 on valid update', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 12, permissions_mode: 'all' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })

  it('returns 500 when db update fails', async () => {
    mockDb({ updateError: { message: 'db error' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 12 }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-update-settings.test.js
```

Expected: FAIL — handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-update-settings/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; vp_goal?: unknown; expansions?: unknown; permissions_mode?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can update settings', 403)
  if (game.status !== 'lobby') return errorResponse('Game has already started', 409)

  const updates: Record<string, unknown> = {}

  if (body.vp_goal !== undefined) {
    if (typeof body.vp_goal !== 'number' || body.vp_goal < 1) {
      return errorResponse("'vp_goal' must be a positive integer")
    }
    updates.vp_goal = body.vp_goal
  }
  if (body.expansions !== undefined) {
    if (typeof body.expansions !== 'object' || body.expansions === null) {
      return errorResponse("'expansions' must be an object")
    }
    updates.expansions = body.expansions
  }
  if (body.permissions_mode !== undefined) {
    if (!['host', 'all'].includes(body.permissions_mode as string)) {
      return errorResponse("'permissions_mode' must be 'host' or 'all'")
    }
    updates.permissions_mode = body.permissions_mode
  }

  if (Object.keys(updates).length === 0) return errorResponse('No valid fields to update')

  const { error: updateError } = await db.from('games').update(updates).eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-update-settings.test.js
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add supabase/functions/game-update-settings/ ti4-companion-web/tests/functions/game-update-settings.test.js
git commit -m "feat: add game-update-settings edge function"
```

---

## Task 4: game-pick-faction-color Edge Function

**Files:**
- Create: `supabase/functions/game-pick-faction-color/index.ts`
- Create: `ti4-companion-web/tests/functions/game-pick-faction-color.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-pick-faction-color.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

function makeRequest(body) {
  return new Request('http://localhost/game-pick-faction-color', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// Returns a membership check mock
function membershipMock(found = true) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: found ? { id: 'player-uuid' } : null }),
        }),
      }),
    }),
  }
}

// Returns a "taken" check mock
function takenMock(taken = false) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: taken ? { id: 'other-player' } : null }),
          }),
        }),
      }),
    }),
  }
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-pick-faction-color/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-pick-faction-color', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    db.from.mockReturnValue(membershipMock())
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when colour is invalid', async () => {
    db.from.mockReturnValue(membershipMock())
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'rainbow' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/colour/)
  })

  it('returns 403 when caller is not in the game', async () => {
    db.from.mockReturnValue(membershipMock(false))
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/not in this game/i)
  })

  it('returns 409 when faction is already taken by another player', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)   // caller is in game
      if (callCount === 2) return takenMock(true)         // faction taken
      return takenMock(false)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction already taken/i)
  })

  it('returns 409 when colour is already taken by another player', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)   // caller is in game
      if (callCount === 2) return takenMock(false)        // faction free
      return takenMock(true)                              // colour taken
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/colour already taken/i)
  })

  it('returns 200 on valid pick', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)
      if (callCount === 2) return takenMock(false)
      if (callCount === 3) return takenMock(false)
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-pick-faction-color.test.js
```

Expected: FAIL — handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-pick-faction-color/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_COLOURS = new Set(['red', 'blue', 'yellow', 'green', 'purple', 'black', 'orange', 'pink'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; faction?: unknown; colour?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.faction || typeof body.faction !== 'string') return errorResponse("'faction' is required")
  if (!body.colour || typeof body.colour !== 'string') return errorResponse("'colour' is required")
  if (!VALID_COLOURS.has(body.colour)) {
    return errorResponse(`'colour' must be one of: ${[...VALID_COLOURS].join(', ')}`)
  }

  // Verify caller is in the game
  const { data: myPlayer, error: myError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (myError) return errorResponse('Database error', 500)
  if (!myPlayer) return errorResponse('You are not in this game', 403)

  // Check faction not taken by another player
  const { data: factionTaken } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('faction', body.faction)
    .neq('user_id', userId)
    .maybeSingle()
  if (factionTaken) return errorResponse('Faction already taken by another player', 409)

  // Check colour not taken by another player
  const { data: colourTaken } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('colour', body.colour)
    .neq('user_id', userId)
    .maybeSingle()
  if (colourTaken) return errorResponse('Colour already taken by another player', 409)

  const { error: updateError } = await db
    .from('game_players')
    .update({ faction: body.faction, colour: body.colour })
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-pick-faction-color.test.js
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add supabase/functions/game-pick-faction-color/ ti4-companion-web/tests/functions/game-pick-faction-color.test.js
git commit -m "feat: add game-pick-faction-color edge function"
```

---

## Task 5: game-set-speaker Edge Function

**Files:**
- Create: `supabase/functions/game-set-speaker/index.ts`
- Create: `ti4-companion-web/tests/functions/game-set-speaker.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-set-speaker.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-set-speaker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby' },
  gameError = null,
  targetPlayer = { id: PLAYER_ID },
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: targetPlayer }),
            }),
          }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-set-speaker/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-set-speaker', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when game is not in lobby', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'active' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 404 when target player is not in the game', async () => {
    mockDb({ targetPlayer: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/player not found/i)
  })

  it('returns 200 on valid speaker assignment', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-set-speaker.test.js
```

Expected: FAIL — handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-set-speaker/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; player_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can set the speaker', 403)
  if (game.status !== 'lobby') return errorResponse('Game has already started', 409)

  const { data: targetPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('id', body.player_id)
    .maybeSingle()
  if (!targetPlayer) return errorResponse('Player not found in this game', 404)

  const { error: updateError } = await db
    .from('games')
    .update({ speaker_player_id: body.player_id })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-set-speaker.test.js
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add supabase/functions/game-set-speaker/ ti4-companion-web/tests/functions/game-set-speaker.test.js
git commit -m "feat: add game-set-speaker edge function"
```

---

## Task 6: game-start Edge Function

**Files:**
- Create: `supabase/functions/game-start/index.ts`
- Create: `ti4-companion-web/tests/functions/game-start.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-start.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const SPEAKER_ID = 'speaker-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const READY_PLAYERS = [
  { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
  { id: 'p2', faction: 'Letnev', colour: 'red', display_name: 'Bob' },
]

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID },
  gameError = null,
  players = READY_PLAYERS,
  playersError = null,
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-start/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-start', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when speaker is not set', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/speaker must be set/i)
  })

  it('returns 409 when a player has not picked faction or colour', async () => {
    mockDb({
      players: [
        { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
        { id: 'p2', faction: null, colour: null, display_name: 'Bob' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Bob/i)
  })

  it('returns 200 and sets status to active when all conditions are met', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(true)
  })

  it('returns 500 when db update fails', async () => {
    mockDb({ updateError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/functions/game-start.test.js
```

Expected: FAIL — handler undefined

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-start/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status, speaker_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can start the game', 403)
  if (game.status !== 'lobby') return errorResponse('Game is not in lobby state', 409)
  if (!game.speaker_player_id) return errorResponse('Speaker must be set before starting', 409)

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, faction, colour, display_name')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)
  if (!players || players.length === 0) return errorResponse('No players in game', 409)

  for (const player of players) {
    if (!player.faction || !player.colour) {
      return errorResponse(`Player "${player.display_name}" has not picked a faction and color`, 409)
    }
  }

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-start.test.js
```

Expected: all 6 tests PASS

- [ ] **Step 5: Run all function tests to confirm nothing regressed**

```bash
npx vitest run tests/functions/
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
cd .. && git add supabase/functions/game-start/ ti4-companion-web/tests/functions/game-start.test.js
git commit -m "feat: add game-start edge function"
```

---

## Task 7: Deploy Edge Functions

Run from the `TI4 Companion/` root directory (requires Supabase CLI logged in and linked to the project).

- [ ] **Step 1: Deploy all 6 game lobby functions**

```bash
cd "TI4 Companion"
supabase functions deploy game-create --no-verify-jwt
supabase functions deploy game-join --no-verify-jwt
supabase functions deploy game-update-settings --no-verify-jwt
supabase functions deploy game-pick-faction-color --no-verify-jwt
supabase functions deploy game-set-speaker --no-verify-jwt
supabase functions deploy game-start --no-verify-jwt
```

Expected: each command prints `Deployed Function game-*` with no errors.

- [ ] **Step 2: Smoke test game-create via curl**

```bash
SUPABASE_URL=$(grep VITE_SUPABASE_URL ti4-companion-web/.env | cut -d= -f2)
# Requires a valid JWT — log in via the app and copy the access_token from browser devtools
curl -X POST "$SUPABASE_URL/functions/v1/game-create" \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"code":"XXXXXX","game_id":"..."}` — a valid room code and UUID.

---

## Task 8: useGame hook

**Files:**
- Create: `ti4-companion-web/src/hooks/useGame.js`
- Create: `ti4-companion-web/tests/hooks/useGame.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/hooks/useGame.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../src/lib/supabase.js', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  }
})

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  updateGameSettings: vi.fn(),
  pickFactionColor: vi.fn(),
  setSpeaker: vi.fn(),
  startGame: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'lobby',
  vp_goal: 10,
  speaker_player_id: null,
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: null, colour: null },
]

function mockSupabaseLoad({ game = GAME, players = PLAYERS, gameError = null, playersError = null } = {}) {
  let callCount = 0
  supabase.from.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // games query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    // game_players query
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
      }),
    }
  })
}

describe('useGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseLoad()
  })

  it('loads game and players on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.game).toEqual(GAME)
    expect(result.current.players).toHaveLength(2)
  })

  it('sets isHost true for the host user', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isHost).toBe(true)
  })

  it('sets isHost false for a non-host player', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'other-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isHost).toBe(false)
  })

  it('sets currentPlayer to the matching player row', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'other-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.currentPlayer?.display_name).toBe('Bob')
  })

  it('redirects to /setup when user is not in the game', async () => {
    mockSupabaseLoad({ players: [] })
    renderHook(() => useGame('ABC123', 'stranger-uuid'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/setup', { replace: true }))
  })

  it('navigates to /game/:code when game status is already active on load', async () => {
    mockSupabaseLoad({ game: { ...GAME, status: 'active' } })
    renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/game/ABC123', { replace: true }))
  })

  it('sets an error when game is not found', async () => {
    mockSupabaseLoad({ game: null })
    const { result } = renderHook(() => useGame('XXXXXX', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/not found/i)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/hooks/useGame.test.js
```

Expected: FAIL — `useGame is not a function`

- [ ] **Step 3: Create useGame.js**

Create `ti4-companion-web/src/hooks/useGame.js`:

```js
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { updateGameSettings, pickFactionColor, setSpeaker, startGame } from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!code || !userId) return

    let channel = null
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError) { setError('Failed to load game'); setLoading(false); return }
      if (!gameData) { setError('Game not found'); setLoading(false); return }

      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)

      if (!mounted) return
      if (playersError) { setError('Failed to load players'); setLoading(false); return }

      const isInGame = (playersData ?? []).some(p => p.user_id === userId)
      if (!isInGame) {
        navigate('/setup', { replace: true })
        return
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setLoading(false)

      if (gameData.status === 'active') {
        navigate(`/game/${code}`, { replace: true })
        return
      }

      channel = supabase
        .channel(`lobby:${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setGame(prev => ({ ...prev, ...payload.new }))
            if (payload.new.status === 'active') {
              navigate(`/game/${code}`, { replace: true })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setPlayers(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
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
  }, [code, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentPlayer = players.find(p => p.user_id === userId) ?? null
  const isHost = game?.host_user_id === userId

  return {
    game,
    players,
    currentPlayer,
    isHost,
    loading,
    error,
    updateSettings: (settings) => updateGameSettings(game.id, settings),
    pickFaction: (faction, colour) => pickFactionColor(game.id, faction, colour),
    setGameSpeaker: (playerId) => setSpeaker(game.id, playerId),
    startTheGame: () => startGame(game.id),
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/hooks/useGame.test.js
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add ti4-companion-web/src/hooks/useGame.js ti4-companion-web/tests/hooks/useGame.test.js
git commit -m "feat: add useGame hook with Realtime subscriptions"
```

---

## Task 9: SetupScreen component

**Files:**
- Create: `ti4-companion-web/src/components/game/SetupScreen.jsx`
- Create: `ti4-companion-web/tests/components/game/SetupScreen.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/game/SetupScreen.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
}))

import { createGame, joinGame } from '../../../src/lib/edgeFunctions.js'
import SetupScreen from '../../../src/components/game/SetupScreen.jsx'

function renderSetup() {
  return render(
    <MemoryRouter>
      <SetupScreen />
    </MemoryRouter>
  )
}

describe('SetupScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Create Game button and join code input', () => {
    renderSetup()
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/room code/i)).toBeInTheDocument()
  })

  it('calls createGame and navigates to lobby on create', async () => {
    createGame.mockResolvedValue({ code: 'ABC123', game_id: 'g1' })
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby/ABC123'))
  })

  it('shows error when createGame fails', async () => {
    createGame.mockRejectedValue(new Error('Server error'))
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument())
  })

  it('calls joinGame with entered code and navigates to lobby', async () => {
    joinGame.mockResolvedValue({ game_id: 'g1', code: 'XYZ789' })
    renderSetup()
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'xyz789' } })
    fireEvent.click(screen.getByRole('button', { name: /join game/i }))
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith('XYZ789'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lobby/XYZ789'))
  })

  it('shows error when joinGame fails', async () => {
    joinGame.mockRejectedValue(new Error('Game not found'))
    renderSetup()
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /join game/i }))
    await waitFor(() => expect(screen.getByText(/game not found/i)).toBeInTheDocument())
  })

  it('Join Game button is disabled when code input is empty', () => {
    renderSetup()
    expect(screen.getByRole('button', { name: /join game/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/components/game/SetupScreen.test.jsx
```

Expected: FAIL — component not found

- [ ] **Step 3: Create SetupScreen.jsx**

Create `ti4-companion-web/src/components/game/SetupScreen.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, joinGame } from '../../lib/edgeFunctions.js'

export default function SetupScreen() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setError(null)
    setLoading(true)
    try {
      const { code } = await createGame()
      navigate(`/lobby/${code}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setError(null)
    setLoading(true)
    try {
      await joinGame(code)
      navigate(`/lobby/${code}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-8 px-4">
      <h1 className="font-display text-bright text-2xl tracking-widest">TI4 COMPANION</h1>

      <div className="panel flex flex-col gap-4 w-full max-w-sm">
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create Game'}
        </button>
      </div>

      <div className="panel flex flex-col gap-4 w-full max-w-sm">
        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <input
            className="input uppercase"
            placeholder="Room code (e.g. ABC123)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button
            type="submit"
            className="btn-ghost"
            disabled={loading || !joinCode.trim()}
          >
            Join Game
          </button>
        </form>
      </div>

      {error && <p className="text-danger text-sm font-body">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/SetupScreen.test.jsx
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add ti4-companion-web/src/components/game/SetupScreen.jsx ti4-companion-web/tests/components/game/SetupScreen.test.jsx
git commit -m "feat: add SetupScreen component"
```

---

## Task 10: LobbyScreen component

**Files:**
- Create: `ti4-companion-web/src/components/game/LobbyScreen.jsx`
- Create: `ti4-companion-web/tests/components/game/LobbyScreen.test.jsx`

TI4 player colors (hardcoded — not in DB): `red`, `blue`, `yellow`, `green`, `purple`, `black`, `orange`, `pink`.

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/game/LobbyScreen.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../../src/hooks/useGame.js', () => ({
  useGame: vi.fn(),
}))

vi.mock('../../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { useGame } from '../../../src/hooks/useGame.js'
import { supabase } from '../../../src/lib/supabase.js'
import LobbyScreen from '../../../src/components/game/LobbyScreen.jsx'

const FACTIONS = [
  { name: 'Arborec', expansion: 'base' },
  { name: 'Letnev', expansion: 'base' },
]

function mockFactions() {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: FACTIONS, error: null }),
    }),
  })
}

function mockGame(overrides = {}) {
  const defaults = {
    game: {
      id: 'game-uuid',
      code: 'ABC123',
      host_user_id: 'host-uuid',
      status: 'lobby',
      vp_goal: 10,
      permissions_mode: 'host',
      expansions: { base: true, pok: false, te: false },
      speaker_player_id: 'p1',
    },
    players: [
      { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
      { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    ],
    currentPlayer: { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: 'Arborec', colour: 'green' },
    isHost: true,
    loading: false,
    error: null,
    updateSettings: vi.fn(),
    pickFaction: vi.fn(),
    setGameSpeaker: vi.fn(),
    startTheGame: vi.fn(),
  }
  useGame.mockReturnValue({ ...defaults, ...overrides })
}

function renderLobby(userId = 'host-uuid') {
  return render(
    <MemoryRouter initialEntries={['/lobby/ABC123']}>
      <Routes>
        <Route path="/lobby/:code" element={<LobbyScreen userId={userId} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LobbyScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFactions()
  })

  it('shows the room code', () => {
    mockGame()
    renderLobby()
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
  })

  it('shows all player names', () => {
    mockGame()
    renderLobby()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('host sees the settings panel', () => {
    mockGame({ isHost: true })
    renderLobby('host-uuid')
    expect(screen.getByLabelText(/vp goal/i)).toBeInTheDocument()
  })

  it('non-host does not see the settings panel', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByLabelText(/vp goal/i)).not.toBeInTheDocument()
  })

  it('Start Game button is disabled when not all players have picked faction/color', () => {
    mockGame({
      players: [
        { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', faction: null, colour: null },
      ],
      isHost: true,
    })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).toBeDisabled()
  })

  it('Start Game button is disabled when no speaker is set', () => {
    mockGame({
      game: {
        id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
        status: 'lobby', vp_goal: 10, permissions_mode: 'host',
        expansions: { base: true, pok: false, te: false },
        speaker_player_id: null,
      },
      isHost: true,
    })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).toBeDisabled()
  })

  it('Start Game button is enabled when all players are ready and speaker is set', () => {
    mockGame({ isHost: true })
    renderLobby()
    expect(screen.getByRole('button', { name: /start game/i })).not.toBeDisabled()
  })

  it('non-host does not see Start Game button', () => {
    mockGame({
      isHost: false,
      currentPlayer: { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', faction: 'Letnev', colour: 'red' },
    })
    renderLobby('other-uuid')
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument()
  })

  it('shows inline error and reverts when pickFaction fails with conflict', async () => {
    const pickFaction = vi.fn().mockRejectedValue(new Error('Faction already taken by another player'))
    mockGame({ isHost: true, pickFaction })
    renderLobby()

    // Select a different faction from the dropdown
    const select = screen.getByLabelText(/faction/i)
    fireEvent.change(select, { target: { value: 'Letnev' } })

    await waitFor(() =>
      expect(screen.getByText(/already taken/i)).toBeInTheDocument()
    )
  })

  it('calls startTheGame when Start Game is clicked', async () => {
    const startTheGame = vi.fn().mockResolvedValue({ started: true })
    mockGame({ isHost: true, startTheGame })
    renderLobby()
    fireEvent.click(screen.getByRole('button', { name: /start game/i }))
    await waitFor(() => expect(startTheGame).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "ti4-companion-web" && npx vitest run tests/components/game/LobbyScreen.test.jsx
```

Expected: FAIL — component not found

- [ ] **Step 3: Create LobbyScreen.jsx**

Create `ti4-companion-web/src/components/game/LobbyScreen.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../../hooks/useGame.js'
import { supabase } from '../../lib/supabase.js'

const COLOURS = ['red', 'blue', 'yellow', 'green', 'purple', 'black', 'orange', 'pink']

export default function LobbyScreen({ userId }) {
  const { code } = useParams()
  const { game, players, currentPlayer, isHost, loading, error,
          updateSettings, pickFaction, setGameSpeaker, startTheGame } = useGame(code, userId)

  const [factions, setFactions] = useState([])
  const [pickError, setPickError] = useState(null)
  const [startError, setStartError] = useState(null)
  const [starting, setStarting] = useState(false)

  // Optimistic faction/color selection
  const [pendingFaction, setPendingFaction] = useState(null)
  const [pendingColour, setPendingColour] = useState(null)

  useEffect(() => {
    supabase.from('factions').select('name, expansion').order('name')
      .then(({ data }) => setFactions(data ?? []))
  }, [])

  const takenFactions = new Set(players.filter(p => p.user_id !== userId).map(p => p.faction).filter(Boolean))
  const takenColours = new Set(players.filter(p => p.user_id !== userId).map(p => p.colour).filter(Boolean))

  const allReady = players.length > 0 && players.every(p => p.faction && p.colour)
  const canStart = allReady && game?.speaker_player_id

  async function handlePick(faction, colour) {
    if (!faction || !colour) return
    setPendingFaction(faction)
    setPendingColour(colour)
    setPickError(null)
    try {
      await pickFaction(faction, colour)
    } catch (e) {
      setPickError(e.message)
      setPendingFaction(null)
      setPendingColour(null)
    }
  }

  async function handleStart() {
    setStartError(null)
    setStarting(true)
    try {
      await startTheGame()
    } catch (e) {
      setStartError(e.message)
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-dim font-display text-xs tracking-widest">LOADING…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-danger font-body text-sm">{error}</span>
      </div>
    )
  }

  const displayFaction = pendingFaction ?? currentPlayer?.faction ?? ''
  const displayColour = pendingColour ?? currentPlayer?.colour ?? ''

  return (
    <div className="min-h-screen bg-void p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-bright text-xl tracking-widest">LOBBY</h1>
        <span className="font-mono text-gold text-lg tracking-widest">{code}</span>
      </div>

      {/* Shareable link */}
      <div className="panel-inset">
        <p className="label">Share this link to invite players</p>
        <p className="font-mono text-text text-sm break-all">
          {window.location.origin}/join/{code}
        </p>
      </div>

      {/* Player list */}
      <div className="panel flex flex-col gap-2">
        <h2 className="label">Players ({players.length}/8)</h2>
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.colour ?? '#555' }}
            />
            <span className="font-body text-text flex-1">{p.display_name}</span>
            <span className="font-body text-muted text-sm">{p.faction ?? '—'}</span>
          </div>
        ))}
      </div>

      {/* Your pick */}
      <div className="panel flex flex-col gap-4">
        <h2 className="label">Your Selection</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="faction-select" className="label">Faction</label>
          <select
            id="faction-select"
            className="input"
            value={displayFaction}
            onChange={(e) => handlePick(e.target.value, displayColour)}
            aria-label="Faction"
          >
            <option value="">— pick a faction —</option>
            {factions.map(f => (
              <option key={f.name} value={f.name} disabled={takenFactions.has(f.name)}>
                {f.name}{takenFactions.has(f.name) ? ' (taken)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="label">Colour</span>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map(c => (
              <button
                key={c}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  displayColour === c ? 'border-bright scale-110' : 'border-transparent'
                } ${takenColours.has(c) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ backgroundColor: c === 'black' ? '#222' : c }}
                disabled={takenColours.has(c)}
                onClick={() => handlePick(displayFaction, c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {pickError && <p className="text-danger text-sm font-body">{pickError}</p>}
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="panel flex flex-col gap-4">
          <h2 className="label">Game Settings</h2>

          <div className="flex flex-col gap-1">
            <label htmlFor="vp-goal" className="label">VP Goal</label>
            <input
              id="vp-goal"
              type="number"
              className="input w-24"
              min={1}
              value={game?.vp_goal ?? 10}
              onChange={(e) => updateSettings({ vp_goal: Number(e.target.value) })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="label">Expansions</span>
            {['pok', 'te'].map(exp => (
              <label key={exp} className="flex items-center gap-2 font-body text-text text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={game?.expansions?.[exp] ?? false}
                  onChange={(e) => updateSettings({ expansions: { ...game.expansions, [exp]: e.target.checked } })}
                />
                {exp === 'pok' ? 'Prophecy of Kings' : "Codex: Vigil & Thunder's Edge"}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="permissions" className="label">Permissions</label>
            <select
              id="permissions"
              className="input"
              value={game?.permissions_mode ?? 'host'}
              onChange={(e) => updateSettings({ permissions_mode: e.target.value })}
            >
              <option value="host">Host only</option>
              <option value="all">All players</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="speaker" className="label">Speaker</label>
            <select
              id="speaker"
              className="input"
              value={game?.speaker_player_id ?? ''}
              onChange={(e) => setGameSpeaker(e.target.value)}
            >
              <option value="">— assign speaker —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </div>

          {startError && <p className="text-danger text-sm font-body">{startError}</p>}

          <button
            className="btn-primary"
            disabled={!canStart || starting}
            onClick={handleStart}
          >
            {starting ? 'Starting…' : 'Start Game'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/LobbyScreen.test.jsx
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
cd .. && git add ti4-companion-web/src/components/game/LobbyScreen.jsx ti4-companion-web/tests/components/game/LobbyScreen.test.jsx
git commit -m "feat: add LobbyScreen component"
```

---

## Task 11: GamePlaceholder + App.jsx routing

**Files:**
- Create: `ti4-companion-web/src/components/game/GamePlaceholder.jsx`
- Modify: `ti4-companion-web/src/App.jsx`

- [ ] **Step 1: Create GamePlaceholder.jsx**

Create `ti4-companion-web/src/components/game/GamePlaceholder.jsx`:

```jsx
export default function GamePlaceholder() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <span className="text-dim font-display text-xs tracking-widest">GAME IN PROGRESS — PHASE 3</span>
    </div>
  )
}
```

- [ ] **Step 2: Update App.jsx**

Replace the entire content of `ti4-companion-web/src/App.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AdminRoute from './components/admin/AdminRoute.jsx'
import AdminDashboard from './components/admin/AdminDashboard.jsx'
import AdminImportPage from './components/admin/AdminImportPage.jsx'
import SetupScreen from './components/game/SetupScreen.jsx'
import LobbyScreen from './components/game/LobbyScreen.jsx'
import GamePlaceholder from './components/game/GamePlaceholder.jsx'
import { joinGame } from './lib/edgeFunctions.js'

// Handles /join/:code — auto-joins then redirects to lobby or setup on failure
function JoinRedirect({ user }) {
  const { code } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    joinGame(code)
      .then(() => navigate(`/lobby/${code.toUpperCase()}`, { replace: true }))
      .catch(e => navigate('/setup', { replace: true, state: { error: e.message } }))
  }, [code, user]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <span className="text-dim font-display text-xs tracking-widest">JOINING…</span>
    </div>
  )
}

export default function App() {
  const { user, loading, sendMagicLink, signOut } = useAuth()
  const [linkSentTo, setLinkSentTo] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  async function handleSendLink(email) {
    setAuthError(null)
    setAuthLoading(true)
    try {
      await sendMagicLink(email)
      setLinkSentTo(email)
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user
            ? <Navigate to="/setup" replace />
            : linkSentTo
              ? <VerifyScreen email={linkSentTo} />
              : <LoginScreen onSendLink={handleSendLink} loading={authLoading} error={authError} />
        }
      />

      <Route
        path="/setup"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <SetupScreen />
          </ProtectedRoute>
        }
      />

      <Route
        path="/join/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <JoinRedirect user={user} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/lobby/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <LobbyScreen userId={user?.id} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/game/:code"
        element={
          <ProtectedRoute user={user} loading={loading}>
            <GamePlaceholder />
          </ProtectedRoute>
        }
      />

      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/import/:table" element={<AdminRoute><AdminImportPage /></AdminRoute>} />

      <Route
        path="*"
        element={
          loading
            ? null
            : <Navigate to={user ? '/setup' : '/login'} replace />
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
cd "ti4-companion-web" && npm test
```

Expected: all tests PASS (previous tests should not have regressed)

- [ ] **Step 4: Commit**

```bash
cd .. && git add ti4-companion-web/src/components/game/GamePlaceholder.jsx ti4-companion-web/src/App.jsx
git commit -m "feat: wire up Phase 2 routes — setup, join, lobby, game placeholder"
```

---

## Task 12: Manual smoke test

Start the dev server and verify the full lobby flow end-to-end.

- [ ] **Step 1: Start the dev server**

```bash
cd "ti4-companion-web" && npm run dev
```

- [ ] **Step 2: Verify the create → lobby flow**

1. Log in with a magic link at `http://localhost:5173`
2. You land on `/setup` — click **Create Game**
3. You should land on `/lobby/XXXXXX` with your display name in the player list

- [ ] **Step 3: Verify the join flow**

1. Open a second browser (or incognito) and log in with a different email
2. Navigate to `http://localhost:5173/join/XXXXXX` (the room code from step 2)
3. You should auto-join and land on the lobby with both players visible in real time

- [ ] **Step 4: Verify faction/color picking**

1. Each player picks a faction and color
2. Verify that taken options appear disabled in the other browser in real time
3. Try picking an already-taken faction — confirm the inline error appears and the pick reverts

- [ ] **Step 5: Verify start game**

1. Host assigns a speaker
2. Host clicks **Start Game** — both browsers should navigate to `/game/XXXXXX`
