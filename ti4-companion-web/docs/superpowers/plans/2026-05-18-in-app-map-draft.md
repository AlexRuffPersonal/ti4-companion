# In-App Map Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an in-app tile drafting mode for game setup, supporting both Official (random deal + snake placement) and Milty (balanced slices + reverse-speaker pick) formats, populating `games.map_tiles` on completion.

**Architecture:** A nullable `draft_state` JSONB column on `games` holds all draft state; three new edge functions manage transitions; the existing `useGame` Realtime subscription broadcasts all changes to every player with no new subscription code.

**Tech Stack:** Deno/TypeScript (edge functions), React 19 + Tailwind CSS 3 (UI), Vitest + @testing-library/react (tests), Supabase JS v2

---

## File Map

**Create:**
- `supabase/migrations/048_draft_state.sql`
- `supabase/functions/_shared/draftHelpers.ts`
- `supabase/functions/game-start-draft/index.ts`
- `supabase/functions/game-draft-pick-slice/index.ts`
- `supabase/functions/game-draft-place-tile/index.ts`
- `src/hooks/useDraft.js`
- `src/components/game/DraftTileHand.jsx`
- `src/components/game/DraftSlicePickView.jsx`
- `src/components/game/DraftPlacementView.jsx`
- `src/components/game/DraftPanel.jsx`
- `tests/functions/game-start-draft.test.js`
- `tests/functions/game-draft-pick-slice.test.js`
- `tests/functions/game-draft-place-tile.test.js`
- `tests/hooks/useDraft.test.js`
- `tests/components/game/DraftTileHand.test.jsx`
- `tests/components/game/DraftSlicePickView.test.jsx`
- `tests/components/game/DraftPlacementView.test.jsx`
- `tests/components/game/DraftPanel.test.jsx`

**Modify:**
- `src/lib/edgeFunctions.js` — add `startDraft`, `draftPickSlice`, `draftPlaceTile`
- `src/components/game/LobbyScreen.jsx` — draft toggle + DraftPanel
- `tests/components/game/LobbyScreen.test.jsx` — extend existing tests
- `tests/lib/edgeFunctions.test.js` — extend existing tests (if present)

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/048_draft_state.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/048_draft_state.sql
ALTER TABLE games ADD COLUMN draft_state JSONB;
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd supabase
supabase db reset
```

Expected: migration applies without error; `\d games` shows `draft_state jsonb` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_draft_state.sql
git commit -m "feat: add draft_state JSONB column to games (Phase 39)"
```

---

## Task 2: `_shared/draftHelpers.ts`

**Files:**
- Create: `supabase/functions/_shared/draftHelpers.ts`

- [ ] **Step 1: Write the helpers file**

```typescript
// supabase/functions/_shared/draftHelpers.ts

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function scoreTile(tile: {
  planets: Array<{ resources: number; influence: number }>
  wormhole: string | null
  anomaly: string | null
}): number {
  const planetScore = (tile.planets ?? []).reduce(
    (s, p) => s + (p.resources ?? 0) + (p.influence ?? 0),
    0
  )
  return planetScore + (tile.wormhole ? 1 : 0) - (tile.anomaly ? 1 : 0)
}

export function buildSnakeOrder(
  playerIds: string[],
  handSizes: Record<string, number>
): string[] {
  const N = playerIds.length
  if (N === 0) return []
  const unit = [...playerIds, ...[...playerIds].reverse()] // length 2N
  const remaining = { ...handSizes }
  const result: string[] = []
  let unitPos = 0

  while (Object.values(remaining).some((n) => n > 0)) {
    const playerId = unit[unitPos % (2 * N)]
    if (remaining[playerId] > 0) {
      result.push(playerId)
      remaining[playerId]--
    }
    unitPos++
    if (unitPos > 100_000) break // safety guard
  }

  return result
}

export function axialRing(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
}

export function hexNeighbors(q: number, r: number): [number, number][] {
  return [
    [q + 1, r],
    [q - 1, r],
    [q, r + 1],
    [q, r - 1],
    [q + 1, r - 1],
    [q - 1, r + 1],
  ]
}
```

- [ ] **Step 2: Write the tests**

```javascript
// tests/functions/draftHelpers.test.js
import { describe, it, expect } from 'vitest'
import { shuffle, scoreTile, buildSnakeOrder, axialRing, hexNeighbors } from '../../supabase/functions/_shared/draftHelpers.ts'

describe('shuffle', () => {
  it('returns array with same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = shuffle(arr)
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the original', () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
  })
})

describe('scoreTile', () => {
  it('sums resources and influence of planets', () => {
    expect(scoreTile({ planets: [{ resources: 2, influence: 1 }], wormhole: null, anomaly: null })).toBe(3)
  })

  it('adds 1 for wormhole', () => {
    expect(scoreTile({ planets: [], wormhole: 'alpha', anomaly: null })).toBe(1)
  })

  it('subtracts 1 for anomaly', () => {
    expect(scoreTile({ planets: [], wormhole: null, anomaly: 'supernova' })).toBe(-1)
  })

  it('handles empty planets', () => {
    expect(scoreTile({ planets: [], wormhole: null, anomaly: null })).toBe(0)
  })
})

describe('buildSnakeOrder', () => {
  it('3P each 3 tiles → length 9, each appears 3 times', () => {
    const result = buildSnakeOrder(['A', 'B', 'C'], { A: 3, B: 3, C: 3 })
    expect(result).toHaveLength(9)
    expect(result.filter(p => p === 'A')).toHaveLength(3)
    expect(result.filter(p => p === 'B')).toHaveLength(3)
    expect(result.filter(p => p === 'C')).toHaveLength(3)
  })

  it('3P produces snake pattern [A,B,C,C,B,A,A,B,C]', () => {
    const result = buildSnakeOrder(['A', 'B', 'C'], { A: 3, B: 3, C: 3 })
    expect(result).toEqual(['A', 'B', 'C', 'C', 'B', 'A', 'A', 'B', 'C'])
  })

  it('6P each 5 tiles → length 30, each appears 5 times', () => {
    const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    const sizes = Object.fromEntries(ids.map(id => [id, 5]))
    const result = buildSnakeOrder(ids, sizes)
    expect(result).toHaveLength(30)
    for (const id of ids) {
      expect(result.filter(p => p === id)).toHaveLength(5)
    }
  })

  it('non-uniform hand sizes: speaker has 6, others 5', () => {
    const ids = ['spk', 'p1', 'p2']
    const result = buildSnakeOrder(ids, { spk: 6, p1: 5, p2: 5 })
    expect(result).toHaveLength(16)
    expect(result.filter(p => p === 'spk')).toHaveLength(6)
  })

  it('returns [] for empty playerIds', () => {
    expect(buildSnakeOrder([], {})).toEqual([])
  })
})

describe('axialRing', () => {
  it('Mecatol is ring 0', () => expect(axialRing(0, 0)).toBe(0))
  it('ring 1 positions', () => {
    expect(axialRing(1, 0)).toBe(1)
    expect(axialRing(0, 1)).toBe(1)
    expect(axialRing(-1, 1)).toBe(1)
  })
  it('ring 2 position', () => expect(axialRing(2, -1)).toBe(2))
  it('ring 3 position', () => expect(axialRing(-3, 3)).toBe(3))
})

describe('hexNeighbors', () => {
  it('returns 6 neighbors for (0,0)', () => {
    const neighbors = hexNeighbors(0, 0)
    expect(neighbors).toHaveLength(6)
  })

  it('includes all expected neighbors of (0,0)', () => {
    const neighbors = hexNeighbors(0, 0)
    expect(neighbors).toContainEqual([1, 0])
    expect(neighbors).toContainEqual([-1, 0])
    expect(neighbors).toContainEqual([0, 1])
    expect(neighbors).toContainEqual([0, -1])
    expect(neighbors).toContainEqual([1, -1])
    expect(neighbors).toContainEqual([-1, 1])
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
cd ti4-companion-web
npx vitest run tests/functions/draftHelpers.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/draftHelpers.ts tests/functions/draftHelpers.test.js
git commit -m "feat: add draftHelpers shared module (shuffle, scoreTile, buildSnakeOrder, axialRing)"
```

---

## Task 3: `game-start-draft` Edge Function

**Files:**
- Create: `supabase/functions/game-start-draft/index.ts`
- Create: `tests/functions/game-start-draft.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/functions/game-start-draft.test.js
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
import { handler } from '../../../supabase/functions/game-start-draft/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-start-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = { game_id: GAME_ID, mode: 'official' }

const PLAYERS_6 = Array.from({ length: 6 }, (_, i) => ({ id: `player-${i}`, seat_index: i }))

const BLUE_TILES = Array.from({ length: 30 }, (_, i) => ({
  tile_number: `b${i + 20}`,
  type: 'blue',
  expansion: 'base',
  planets: [{ resources: 1, influence: 1 }],
  wormhole: null,
  anomaly: null,
}))
const RED_TILES = Array.from({ length: 20 }, (_, i) => ({
  tile_number: `r${i + 60}`,
  type: 'red',
  expansion: 'base',
  planets: [],
  wormhole: null,
  anomaly: null,
}))

function mockDb({
  player = { id: PLAYER_ID },
  game = { status: 'lobby', host_user_id: USER_ID, expansions: { pok: false }, speaker: 'player-0', draft_state: null },
  players = PLAYERS_6,
  tiles = [...BLUE_TILES, ...RED_TILES],
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: players, error: null }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: tiles, error: null }),
            then: (resolve) => resolve({ data: tiles, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-start-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for OPTIONS', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id missing', async () => {
    const res = await handler(makeRequest({ mode: 'official' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when mode missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid mode', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'random' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not host', async () => {
    mockDb({ game: { status: 'lobby', host_user_id: 'other', expansions: {}, speaker: 'player-0', draft_state: null } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('returns 409 when game not in lobby', async () => {
    mockDb({ game: { status: 'in_progress', host_user_id: USER_ID, expansions: {}, speaker: 'player-0', draft_state: null } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
  })

  it('returns 409 when draft already active', async () => {
    mockDb({ game: { status: 'lobby', host_user_id: USER_ID, expansions: {}, speaker: 'player-0', draft_state: { phase: 'placement' } } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
  })

  it('returns 409 when player count < 3', async () => {
    mockDb({ players: [{ id: 'p0', seat_index: 0 }, { id: 'p1', seat_index: 1 }] })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
  })

  it('official 6P: sets hands of 5 tiles each and placement_order of 30', async () => {
    let writtenState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'lobby', host_user_id: USER_ID, expansions: { pok: false }, speaker: 'player-0', draft_state: null },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            writtenState = data.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: PLAYERS_6, error: null }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [...BLUE_TILES, ...RED_TILES], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(writtenState).not.toBeNull()
    expect(writtenState.mode).toBe('official')
    expect(writtenState.phase).toBe('placement')
    expect(writtenState.placement_order).toHaveLength(30)
    for (const p of PLAYERS_6) {
      expect(writtenState.hands[p.id]).toHaveLength(5)
    }
  })

  it('milty 6P: creates 6 slices with balanced scores; phase=slice-pick', async () => {
    let writtenState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'lobby', host_user_id: USER_ID, expansions: { pok: false }, speaker: 'player-0', draft_state: null },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            writtenState = data.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: PLAYERS_6, error: null }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [...BLUE_TILES, ...RED_TILES], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'milty' }))
    expect(res.status).toBe(200)
    expect(writtenState.phase).toBe('slice-pick')
    expect(writtenState.slices).toHaveLength(6)
    const scores = writtenState.slices.map((s) => s.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-start-draft.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/game-start-draft/index.ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { shuffle, scoreTile, buildSnakeOrder } from '../_shared/draftHelpers.ts'

const DEALT: Record<number, { b: number; r: number; sb?: number; sr?: number }> = {
  3: { b: 6, r: 2 },
  4: { b: 5, r: 3 },
  5: { b: 4, r: 2, sr: 1 },
  6: { b: 3, r: 2 },
  7: { b: 4, r: 2, sb: 3, sr: 2 },
  8: { b: 4, r: 2, sb: 2, sr: 2 },
}

type TileRow = {
  tile_number: string
  type: string
  expansion: string
  planets: Array<{ resources: number; influence: number }>
  wormhole: string | null
  anomaly: string | null
}

type Slice = {
  id: number
  tiles: string[]
  score: number
  claimed_by: string | null
}

function balanceSlices(
  blueTiles: TileRow[],
  redTiles: TileRow[],
  N: number,
  blueEach: number,
  redEach: number
): Slice[] {
  const slices: Slice[] = Array.from({ length: N }, (_, i) => ({
    id: i,
    tiles: [],
    score: 0,
    claimed_by: null,
  }))

  // Score and sort each pool descending; take only what we need
  const scored = [
    ...blueTiles.map((t) => ({ ...t, score: scoreTile(t) })).sort((a, b) => b.score - a.score).slice(0, N * blueEach),
    ...redTiles.map((t) => ({ ...t, score: scoreTile(t) })).sort((a, b) => b.score - a.score).slice(0, N * redEach),
  ].sort((a, b) => b.score - a.score)

  // Greedy: assign each tile to the lowest-score slice
  for (const tile of scored) {
    const minSlice = slices.reduce((min, s) => (s.score < min.score ? s : min))
    minSlice.tiles.push(tile.tile_number)
    minSlice.score += tile.score
  }

  return slices
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; mode?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.mode || typeof body.mode !== 'string') return errorResponse("'mode' is required")
  if (!['official', 'milty'].includes(body.mode)) return errorResponse("'mode' must be 'official' or 'milty'")

  const gameId = body.game_id
  const mode = body.mode as 'official' | 'milty'

  const { data: game } = await db
    .from('games')
    .select('status, host_user_id, expansions, speaker, draft_state')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Not host', 403)
  if (game.status !== 'lobby') return errorResponse('Game not in lobby', 409)
  if (game.draft_state !== null) return errorResponse('Draft already active', 409)

  const { data: players } = await db
    .from('game_players')
    .select('id, seat_index')
    .eq('game_id', gameId)
    .order('seat_index')
  if (!players || players.length < 3) return errorResponse('Need at least 3 players', 409)

  const pokEnabled = game.expansions?.pok ?? false
  let tileQuery = db
    .from('tiles')
    .select('tile_number, type, expansion, planets, wormhole, anomaly')
    .in('type', ['blue', 'red'])
  if (!pokEnabled) tileQuery = (tileQuery as ReturnType<typeof tileQuery.in>).eq('expansion', 'base')
  const { data: tiles } = await tileQuery
  if (!tiles) return errorResponse('Could not load tiles', 500)

  const blueTiles = (tiles as TileRow[]).filter((t) => t.type === 'blue')
  const redTiles = (tiles as TileRow[]).filter((t) => t.type === 'red')

  const N = players.length
  const counts = DEALT[N] ?? DEALT[6]

  // Rotate so speaker is first
  const speakerIdx = players.findIndex((p) => p.id === game.speaker)
  const startIdx = speakerIdx >= 0 ? speakerIdx : 0
  const ordered = [...players.slice(startIdx), ...players.slice(0, startIdx)]

  if (mode === 'official') {
    const shuffledBlue = shuffle(blueTiles)
    const shuffledRed = shuffle(redTiles)
    const hands: Record<string, string[]> = {}
    let bOff = 0
    let rOff = 0
    for (const player of ordered) {
      const isSpeaker = player.id === game.speaker
      const bCount = counts.b + (isSpeaker ? (counts.sb ?? 0) : 0)
      const rCount = counts.r + (isSpeaker ? (counts.sr ?? 0) : 0)
      hands[player.id] = [
        ...shuffledBlue.slice(bOff, bOff + bCount).map((t) => t.tile_number),
        ...shuffledRed.slice(rOff, rOff + rCount).map((t) => t.tile_number),
      ]
      bOff += bCount
      rOff += rCount
    }
    const handSizes = Object.fromEntries(Object.entries(hands).map(([id, h]) => [id, h.length]))
    const placement_order = buildSnakeOrder(ordered.map((p) => p.id), handSizes)
    const draftState = {
      mode: 'official',
      phase: 'placement',
      hands,
      placement_order,
      placement_index: 0,
      placed_tiles: {},
    }
    await db.from('games').update({ draft_state: draftState }).eq('id', gameId)
    return okResponse({ mode, phase: 'placement', player_count: N })
  }

  // Milty mode
  const slices = balanceSlices(blueTiles, redTiles, N, counts.b, counts.r)
  const pick_order = [...ordered].reverse().map((p) => p.id)
  const draftState = {
    mode: 'milty',
    phase: 'slice-pick',
    slices,
    pick_order,
    pick_index: 0,
    hands: {},
    placement_order: [],
    placement_index: 0,
    placed_tiles: {},
  }
  await db.from('games').update({ draft_state: draftState }).eq('id', gameId)
  return okResponse({ mode, phase: 'slice-pick', player_count: N })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-start-draft.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-start-draft/index.ts tests/functions/game-start-draft.test.js
git commit -m "feat: add game-start-draft edge function (Phase 39)"
```

---

## Task 4: `game-draft-pick-slice` Edge Function

**Files:**
- Create: `supabase/functions/game-draft-pick-slice/index.ts`
- Create: `tests/functions/game-draft-pick-slice.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/functions/game-draft-pick-slice.test.js
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
import { handler } from '../../../supabase/functions/game-draft-pick-slice/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_0 = 'player-0'
const PLAYER_1 = 'player-1'
const PLAYER_2 = 'player-2'

const SLICES = [
  { id: 0, tiles: ['20', '21', '22', '23', '24'], score: 8, claimed_by: null },
  { id: 1, tiles: ['30', '31', '32', '33', '34'], score: 7.5, claimed_by: null },
  { id: 2, tiles: ['40', '41', '42', '43', '44'], score: 8.5, claimed_by: null },
]

const DRAFT_STATE_SLICE_PICK = {
  mode: 'milty',
  phase: 'slice-pick',
  slices: SLICES,
  pick_order: [PLAYER_2, PLAYER_1, PLAYER_0],
  pick_index: 0,
  hands: {},
  placement_order: [],
  placement_index: 0,
  placed_tiles: {},
}

function makeRequest(body) {
  return new Request('http://localhost/game-draft-pick-slice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ player = { id: PLAYER_2 }, game = { draft_state: DRAFT_STATE_SLICE_PICK }, writtenState = null } = {}) {
  let capturedState = writtenState
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          capturedState = data.draft_state
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })
  return () => capturedState
}

describe('game-draft-pick-slice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for OPTIONS', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id missing', async () => {
    const res = await handler(makeRequest({ slice_id: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when slice_id missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when draft not in slice-pick phase', async () => {
    mockDb({ game: { draft_state: { ...DRAFT_STATE_SLICE_PICK, phase: 'placement' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(409)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when not the active picker', async () => {
    mockDb({ player: { id: PLAYER_0 } }) // pick_order[0] is PLAYER_2
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(403)
  })

  it('returns 404 when slice_id not found', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 99 }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when slice already claimed', async () => {
    const claimed = { ...DRAFT_STATE_SLICE_PICK, slices: [{ ...SLICES[0], claimed_by: PLAYER_1 }, ...SLICES.slice(1)] }
    mockDb({ game: { draft_state: claimed } })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(409)
  })

  it('valid pick: slice claimed, tiles in hands, pick_index incremented', async () => {
    const getState = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 0 }))
    expect(res.status).toBe(200)
    const state = getState()
    expect(state.slices[0].claimed_by).toBe(PLAYER_2)
    expect(state.hands[PLAYER_2]).toEqual(SLICES[0].tiles)
    expect(state.pick_index).toBe(1)
    expect(state.phase).toBe('slice-pick')
  })

  it('last pick: phase transitions to placement, placement_order populated', async () => {
    // Two slices already claimed, this is the third (last) pick
    const almostDone = {
      ...DRAFT_STATE_SLICE_PICK,
      pick_index: 2,
      hands: {
        [PLAYER_2]: SLICES[0].tiles,
        [PLAYER_1]: SLICES[1].tiles,
      },
      slices: [
        { ...SLICES[0], claimed_by: PLAYER_2 },
        { ...SLICES[1], claimed_by: PLAYER_1 },
        { ...SLICES[2], claimed_by: null },
      ],
    }
    requireAuth.mockResolvedValue(USER_ID)
    const getState = mockDb({ player: { id: PLAYER_0 }, game: { draft_state: almostDone } })
    const res = await handler(makeRequest({ game_id: GAME_ID, slice_id: 2 }))
    expect(res.status).toBe(200)
    const state = getState()
    expect(state.phase).toBe('placement')
    expect(state.placement_order.length).toBeGreaterThan(0)
    expect(state.hands[PLAYER_0]).toEqual(SLICES[2].tiles)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-draft-pick-slice.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/game-draft-pick-slice/index.ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { buildSnakeOrder } from '../_shared/draftHelpers.ts'

type Slice = { id: number; tiles: string[]; score: number; claimed_by: string | null }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; slice_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (body.slice_id === undefined || typeof body.slice_id !== 'number') return errorResponse("'slice_id' is required and must be a number")

  const gameId = body.game_id
  const sliceId = body.slice_id as number

  const { data: game } = await db.from('games').select('draft_state').eq('id', gameId).maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const ds = game.draft_state
  if (!ds || ds.phase !== 'slice-pick') return errorResponse('No slice-pick draft active', 409)

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  if (player.id !== ds.pick_order[ds.pick_index]) return errorResponse('Not your turn to pick', 403)

  const slice = (ds.slices as Slice[]).find((s) => s.id === sliceId)
  if (!slice) return errorResponse('Slice not found', 404)
  if (slice.claimed_by !== null) return errorResponse('Slice already claimed', 409)

  const updatedSlices = (ds.slices as Slice[]).map((s) =>
    s.id === sliceId ? { ...s, claimed_by: player.id } : s
  )
  const updatedHands = { ...ds.hands, [player.id]: slice.tiles }
  const newPickIndex = ds.pick_index + 1
  const allClaimed = newPickIndex >= ds.pick_order.length

  let newPhase = ds.phase
  let placement_order = ds.placement_order

  if (allClaimed) {
    newPhase = 'placement'
    const playerOrder = [...(ds.pick_order as string[])].reverse()
    const handSizes = Object.fromEntries(
      Object.entries(updatedHands as Record<string, string[]>).map(([id, h]) => [id, h.length])
    )
    placement_order = buildSnakeOrder(playerOrder, handSizes)
  }

  await db.from('games').update({
    draft_state: {
      ...ds,
      slices: updatedSlices,
      hands: updatedHands,
      pick_index: newPickIndex,
      phase: newPhase,
      placement_order,
    },
  }).eq('id', gameId)

  return okResponse({ phase: newPhase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-draft-pick-slice.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-draft-pick-slice/index.ts tests/functions/game-draft-pick-slice.test.js
git commit -m "feat: add game-draft-pick-slice edge function (Phase 39)"
```

---

## Task 5: `game-draft-place-tile` Edge Function

**Files:**
- Create: `supabase/functions/game-draft-place-tile/index.ts`
- Create: `tests/functions/game-draft-place-tile.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/functions/game-draft-place-tile.test.js
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
import { handler } from '../../../supabase/functions/game-draft-place-tile/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_0 = 'player-0'
const PLAYER_1 = 'player-1'

const BASE_DRAFT_STATE = {
  mode: 'official',
  phase: 'placement',
  hands: { [PLAYER_0]: ['30', '34', '35'], [PLAYER_1]: ['36', '37', '38'] },
  placement_order: [PLAYER_0, PLAYER_1, PLAYER_1, PLAYER_0, PLAYER_0, PLAYER_1],
  placement_index: 0,
  placed_tiles: {},
}

function makeRequest(body) {
  return new Request('http://localhost/game-draft-place-tile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = { game_id: GAME_ID, tile_number: '30', position: '1,0' }

function mockDb({ player = { id: PLAYER_0 }, game = { draft_state: BASE_DRAFT_STATE }, tileRow = { wormhole: null, anomaly: null }, tileIds = [{ id: 'tile-id-30', tile_number: '30' }] } = {}) {
  let capturedState = null
  let capturedMapTiles = null
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          capturedState = data.draft_state ?? null
          capturedMapTiles = data.map_tiles ?? null
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tileRow, error: null }),
            in: vi.fn().mockResolvedValue({ data: tileIds, error: null }),
          }),
          in: vi.fn().mockResolvedValue({ data: tileIds, error: null }),
        }),
      }
    }
    return {}
  })
  return () => ({ state: capturedState, mapTiles: capturedMapTiles })
}

describe('game-draft-place-tile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for OPTIONS', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id missing', async () => {
    const res = await handler(makeRequest({ tile_number: '30', position: '1,0' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when tile_number missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, position: '1,0' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when position missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tile_number: '30' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 409 when draft not in placement phase', async () => {
    mockDb({ game: { draft_state: { ...BASE_DRAFT_STATE, phase: 'slice-pick' } } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
  })

  it('returns 403 when not the active placer', async () => {
    mockDb({ player: { id: PLAYER_1 } }) // placement_order[0] = PLAYER_0
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('returns 400 when tile not in hand', async () => {
    mockDb()
    const res = await handler(makeRequest({ ...VALID_BODY, tile_number: '99' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when position already occupied', async () => {
    mockDb({ game: { draft_state: { ...BASE_DRAFT_STATE, placed_tiles: { '1,0': { tile_number: '22' } } } } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(400)
  })

  it('returns 400 when position is Mecatol', async () => {
    mockDb()
    const res = await handler(makeRequest({ ...VALID_BODY, position: '0,0' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ring skipped (ring 3 with nothing placed)', async () => {
    mockDb()
    const res = await handler(makeRequest({ ...VALID_BODY, position: '3,-3' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for anomaly-anomaly adjacency when alternatives exist', async () => {
    mockDb({
      game: {
        draft_state: {
          ...BASE_DRAFT_STATE,
          placed_tiles: { '1,0': { tile_number: '17', wormhole: null, anomaly: 'supernova' } },
        },
      },
      tileRow: { wormhole: null, anomaly: 'gravity_rift' },
    })
    // hand has 3 tiles, so alternatives exist
    const res = await handler(makeRequest({ ...VALID_BODY, position: '0,1' })) // adjacent to 1,0
    expect(res.status).toBe(400)
  })

  it('allows anomaly-anomaly with warning when only 1 tile left in hand', async () => {
    mockDb({
      game: {
        draft_state: {
          ...BASE_DRAFT_STATE,
          hands: { [PLAYER_0]: ['30'] }, // only 1 tile
          placement_order: [PLAYER_0],
          placement_index: 0,
          placed_tiles: { '1,0': { tile_number: '17', wormhole: null, anomaly: 'supernova' } },
        },
      },
      tileRow: { wormhole: null, anomaly: 'gravity_rift' },
    })
    const res = await handler(makeRequest({ ...VALID_BODY, position: '0,1' }))
    // Should be 200 (last tile, complete=true) or at minimum not 400
    expect([200, 200]).toContain(res.status)
    const body = await res.json()
    expect(body.warnings.length).toBeGreaterThan(0)
  })

  it('valid placement: tile removed from hand, placed_tiles updated, index incremented', async () => {
    const getCaptured = mockDb()
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const captured = getCaptured()
    expect(captured.state.hands[PLAYER_0]).not.toContain('30')
    expect(captured.state.placed_tiles['1,0']).toMatchObject({ tile_number: '30' })
    expect(captured.state.placement_index).toBe(1)
    const body = await res.json()
    expect(body.complete).toBe(false)
  })

  it('final tile: draft_state=null, map_tiles written', async () => {
    const singleTileState = {
      ...BASE_DRAFT_STATE,
      hands: { [PLAYER_0]: ['30'] },
      placement_order: [PLAYER_0],
      placement_index: 0,
    }
    const getCaptured = mockDb({
      game: { draft_state: singleTileState },
      tileIds: [
        { id: 'tile-id-30', tile_number: '30' },
        { id: 'tile-id-18', tile_number: '18' },
      ],
    })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const captured = getCaptured()
    expect(captured.state).toBeNull() // draft_state set to null
    expect(captured.mapTiles).not.toBeNull()
    expect(captured.mapTiles['0,0']).toBeDefined() // Mecatol present
    expect(captured.mapTiles['1,0']).toMatchObject({ tile_number: '30' })
    const body = await res.json()
    expect(body.complete).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-draft-place-tile.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// supabase/functions/game-draft-place-tile/index.ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { axialRing, hexNeighbors } from '../_shared/draftHelpers.ts'

type PlacedTile = {
  tile_number: string
  rotation: number
  wormhole: string | null
  anomaly: string | null
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; tile_number?: unknown; position?: unknown; rotation?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.tile_number || typeof body.tile_number !== 'string') return errorResponse("'tile_number' is required")
  if (!body.position || typeof body.position !== 'string') return errorResponse("'position' is required")

  const gameId = body.game_id
  const tileNumber = body.tile_number
  const position = body.position
  const rotation = typeof body.rotation === 'number' ? body.rotation : 0

  const { data: game } = await db.from('games').select('draft_state').eq('id', gameId).maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const ds = game.draft_state
  if (!ds || ds.phase !== 'placement') return errorResponse('No placement draft active', 409)

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  if (player.id !== ds.placement_order[ds.placement_index]) return errorResponse('Not your turn', 403)

  const hand: string[] = ds.hands[player.id] ?? []
  if (!hand.includes(tileNumber)) return errorResponse('Tile not in hand', 400)

  const placed = ds.placed_tiles as Record<string, PlacedTile>
  if (placed[position]) return errorResponse('Position already occupied', 400)
  if (position === '0,0') return errorResponse('Cannot place at Mecatol', 400)

  const parts = position.split(',').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return errorResponse('Invalid position format', 400)
  const [q, r] = parts

  const targetRing = axialRing(q, r)
  const placedKeys = Object.keys(placed)
  const maxPlacedRing =
    placedKeys.length > 0
      ? Math.max(...placedKeys.map((k) => { const [pq, pr] = k.split(',').map(Number); return axialRing(pq, pr) }))
      : 0
  if (targetRing > maxPlacedRing + 1) return errorResponse('Must complete inner rings first', 400)

  const { data: tileRow } = await db
    .from('tiles')
    .select('wormhole, anomaly')
    .eq('tile_number', tileNumber)
    .maybeSingle()
  if (!tileRow) return errorResponse('Tile not found in reference', 404)

  const warnings: string[] = []
  const neighbors = hexNeighbors(q, r)

  if (tileRow.anomaly) {
    const hasAnomalyNeighbor = neighbors.some(([nq, nr]) => placed[`${nq},${nr}`]?.anomaly)
    if (hasAnomalyNeighbor) {
      if (hand.length > 1) return errorResponse('Cannot place adjacent anomalies', 400)
      warnings.push('Adjacent anomalies — no other option')
    }
  }

  if (tileRow.wormhole) {
    const hasSameWormholeNeighbor = neighbors.some(
      ([nq, nr]) => placed[`${nq},${nr}`]?.wormhole === tileRow.wormhole
    )
    if (hasSameWormholeNeighbor) {
      if (hand.length > 1) return errorResponse('Cannot place adjacent same-type wormholes', 400)
      warnings.push('Adjacent same-type wormholes — no other option')
    }
  }

  const updatedHands = { ...ds.hands, [player.id]: hand.filter((t) => t !== tileNumber) }
  const updatedPlaced: Record<string, PlacedTile> = {
    ...placed,
    [position]: { tile_number: tileNumber, rotation, wormhole: tileRow.wormhole, anomaly: tileRow.anomaly },
  }
  const newIndex = ds.placement_index + 1
  const isComplete = newIndex >= (ds.placement_order as string[]).length

  if (isComplete) {
    const allTileNumbers = Object.values(updatedPlaced).map((t) => t.tile_number)
    const { data: tileRows } = await db.from('tiles').select('id, tile_number').in('tile_number', allTileNumbers)
    const tileIdMap: Record<string, string> = {}
    for (const t of tileRows ?? []) tileIdMap[t.tile_number] = t.id

    // Find Mecatol tile id
    const { data: mecatol } = await db.from('tiles').select('id').eq('tile_number', '18').maybeSingle()

    const mapTiles: Record<string, unknown> = {
      '0,0': { tile_number: '18', tile_id: mecatol?.id ?? null, rotation: 0 },
    }
    for (const [coord, p] of Object.entries(updatedPlaced)) {
      mapTiles[coord] = {
        tile_number: p.tile_number,
        tile_id: tileIdMap[p.tile_number] ?? null,
        rotation: p.rotation,
      }
    }
    await db.from('games').update({ draft_state: null, map_tiles: mapTiles }).eq('id', gameId)
    return okResponse({ complete: true, warnings })
  }

  await db.from('games').update({
    draft_state: {
      ...ds,
      hands: updatedHands,
      placed_tiles: updatedPlaced,
      placement_index: newIndex,
    },
  }).eq('id', gameId)

  return okResponse({
    complete: false,
    next_player: (ds.placement_order as string[])[newIndex],
    warnings,
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-draft-place-tile.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-draft-place-tile/index.ts tests/functions/game-draft-place-tile.test.js
git commit -m "feat: add game-draft-place-tile edge function (Phase 39)"
```

---

## Task 6: Client Wrappers (`edgeFunctions.js`)

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/lib/edgeFunctions.test.js` (create if it doesn't exist):

```javascript
// Add these tests to the existing edgeFunctions test file, or create tests/lib/edgeFunctions.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from '../../src/lib/supabase.js'
import { startDraft, draftPickSlice, draftPlaceTile } from '../../src/lib/edgeFunctions.js'

beforeEach(() => {
  vi.clearAllMocks()
  supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
})

describe('startDraft', () => {
  it('calls game-start-draft with game_id and mode', async () => {
    await startDraft('game-1', 'milty')
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-start-draft',
      { body: { game_id: 'game-1', mode: 'milty' } }
    )
  })
})

describe('draftPickSlice', () => {
  it('calls game-draft-pick-slice with game_id and slice_id', async () => {
    await draftPickSlice('game-1', 2)
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-draft-pick-slice',
      { body: { game_id: 'game-1', slice_id: 2 } }
    )
  })
})

describe('draftPlaceTile', () => {
  it('calls game-draft-place-tile with all args', async () => {
    await draftPlaceTile('game-1', '30', '1,0', 2)
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-draft-place-tile',
      { body: { game_id: 'game-1', tile_number: '30', position: '1,0', rotation: 2 } }
    )
  })

  it('defaults rotation to 0', async () => {
    await draftPlaceTile('game-1', '30', '1,0')
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-draft-place-tile',
      { body: { game_id: 'game-1', tile_number: '30', position: '1,0', rotation: 0 } }
    )
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/lib/edgeFunctions.test.js
```

Expected: FAIL (functions not exported).

- [ ] **Step 3: Add the wrappers to `edgeFunctions.js`**

Append to the end of `src/lib/edgeFunctions.js`:

```javascript
export const startDraft = (gameId, mode) =>
  callFunction('game-start-draft', { game_id: gameId, mode })

export const draftPickSlice = (gameId, sliceId) =>
  callFunction('game-draft-pick-slice', { game_id: gameId, slice_id: sliceId })

export const draftPlaceTile = (gameId, tileNumber, position, rotation = 0) =>
  callFunction('game-draft-place-tile', { game_id: gameId, tile_number: tileNumber, position, rotation })
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/lib/edgeFunctions.test.js
```

Expected: all draft tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.test.js
git commit -m "feat: add startDraft, draftPickSlice, draftPlaceTile client wrappers (Phase 39)"
```

---

## Task 7: `useDraft` Hook

**Files:**
- Create: `src/hooks/useDraft.js`
- Create: `tests/hooks/useDraft.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks/useDraft.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  startDraft: vi.fn().mockResolvedValue({}),
  draftPickSlice: vi.fn().mockResolvedValue({}),
  draftPlaceTile: vi.fn().mockResolvedValue({}),
}))

import { startDraft, draftPickSlice, draftPlaceTile } from '../../src/lib/edgeFunctions.js'
import { useDraft } from '../../src/hooks/useDraft.js'

const PLAYER_0 = { id: 'p0' }
const PLAYER_1 = { id: 'p1' }

const SLICE_PICK_STATE = {
  mode: 'milty',
  phase: 'slice-pick',
  pick_order: ['p1', 'p0'],
  pick_index: 0,
  hands: {},
  placement_order: [],
  placement_index: 0,
  placed_tiles: {},
}

const PLACEMENT_STATE = {
  mode: 'official',
  phase: 'placement',
  hands: { p0: ['30', '31'], p1: ['40'] },
  placement_order: ['p0', 'p1', 'p1', 'p0'],
  placement_index: 0,
  placed_tiles: {},
}

function makeGame(draftState) {
  return { id: 'game-1', draft_state: draftState }
}

beforeEach(() => vi.clearAllMocks())

describe('useDraft', () => {
  it('draftState is null when game.draft_state is null', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: PLAYER_0 }))
    expect(result.current.draftState).toBeNull()
  })

  it('isMyTurn=false when draftState is null', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: PLAYER_0 }))
    expect(result.current.isMyTurn).toBe(false)
  })

  it('isMyTurn=true in slice-pick when currentPlayer is active picker', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(SLICE_PICK_STATE), currentPlayer: PLAYER_1 }))
    expect(result.current.isMyTurn).toBe(true)
  })

  it('isMyTurn=false in slice-pick when currentPlayer is not active picker', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(SLICE_PICK_STATE), currentPlayer: PLAYER_0 }))
    expect(result.current.isMyTurn).toBe(false)
  })

  it('isMyTurn=true in placement when currentPlayer is active placer', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(PLACEMENT_STATE), currentPlayer: PLAYER_0 }))
    expect(result.current.isMyTurn).toBe(true)
  })

  it('isMyTurn=false in placement when not active placer', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(PLACEMENT_STATE), currentPlayer: PLAYER_1 }))
    expect(result.current.isMyTurn).toBe(false)
  })

  it('myHand returns tiles for currentPlayer', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(PLACEMENT_STATE), currentPlayer: PLAYER_0 }))
    expect(result.current.myHand).toEqual(['30', '31'])
  })

  it('myHand returns [] when player not in hands', () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(PLACEMENT_STATE), currentPlayer: { id: 'unknown' } }))
    expect(result.current.myHand).toEqual([])
  })

  it('startDraft calls startDraft(gameId, mode)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(null), currentPlayer: PLAYER_0 }))
    await result.current.startDraft('milty')
    expect(startDraft).toHaveBeenCalledWith('game-1', 'milty')
  })

  it('pickSlice calls draftPickSlice(gameId, sliceId)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(SLICE_PICK_STATE), currentPlayer: PLAYER_1 }))
    await result.current.pickSlice(2)
    expect(draftPickSlice).toHaveBeenCalledWith('game-1', 2)
  })

  it('placeTile calls draftPlaceTile(gameId, tileNumber, position, rotation)', async () => {
    const { result } = renderHook(() => useDraft({ game: makeGame(PLACEMENT_STATE), currentPlayer: PLAYER_0 }))
    await result.current.placeTile('30', '1,0', 1)
    expect(draftPlaceTile).toHaveBeenCalledWith('game-1', '30', '1,0', 1)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/hooks/useDraft.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```javascript
// src/hooks/useDraft.js
import { startDraft as startDraftFn, draftPickSlice as pickSliceFn, draftPlaceTile as placeTileFn } from '../lib/edgeFunctions.js'

export function useDraft({ game, currentPlayer }) {
  const draftState = game?.draft_state ?? null
  const gameId = game?.id ?? null

  let isMyTurn = false
  if (draftState && currentPlayer) {
    if (draftState.phase === 'slice-pick') {
      isMyTurn = draftState.pick_order[draftState.pick_index] === currentPlayer.id
    } else if (draftState.phase === 'placement') {
      isMyTurn = draftState.placement_order[draftState.placement_index] === currentPlayer.id
    }
  }

  const myHand = draftState?.hands?.[currentPlayer?.id] ?? []

  return {
    draftState,
    isMyTurn,
    myHand,
    startDraft: (mode) => startDraftFn(gameId, mode),
    pickSlice: (sliceId) => pickSliceFn(gameId, sliceId),
    placeTile: (tileNumber, position, rotation) => placeTileFn(gameId, tileNumber, position, rotation),
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/hooks/useDraft.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDraft.js tests/hooks/useDraft.test.js
git commit -m "feat: add useDraft hook (Phase 39)"
```

---

## Task 8: `DraftTileHand` Component

**Files:**
- Create: `src/components/game/DraftTileHand.jsx`
- Create: `tests/components/game/DraftTileHand.test.jsx`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/components/game/DraftTileHand.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DraftTileHand from '../../../src/components/game/DraftTileHand.jsx'

const TILE_BY_NUMBER = {
  '30': { id: 't30', tile_number: '30', planets: [{ resources: 2, influence: 1 }], wormhole: null, anomaly: null },
  '34': { id: 't34', tile_number: '34', planets: [], wormhole: null, anomaly: 'supernova' },
  '35': { id: 't35', tile_number: '35', planets: [{ resources: 1, influence: 2 }], wormhole: 'alpha', anomaly: null },
}

function renderHand(props = {}) {
  return render(
    <DraftTileHand
      tiles={['30', '34', '35']}
      tileByNumber={TILE_BY_NUMBER}
      isMyTurn={true}
      selectedTile={null}
      onSelect={vi.fn()}
      {...props}
    />
  )
}

describe('DraftTileHand', () => {
  it('renders each tile number', () => {
    renderHand()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('35')).toBeInTheDocument()
  })

  it('shows R/I totals for planet tiles', () => {
    renderHand()
    expect(screen.getByText('2R / 1I')).toBeInTheDocument()
  })

  it('shows anomaly label for anomaly tiles', () => {
    renderHand()
    expect(screen.getByText('supernova')).toBeInTheDocument()
  })

  it('shows wormhole indicator when tile has wormhole', () => {
    renderHand()
    expect(screen.getByText(/alpha/i)).toBeInTheDocument()
  })

  it('calls onSelect when clicking a tile while isMyTurn=true', () => {
    const onSelect = vi.fn()
    renderHand({ onSelect })
    fireEvent.click(screen.getByText('30').closest('button'))
    expect(onSelect).toHaveBeenCalledWith('30')
  })

  it('does not call onSelect when isMyTurn=false', () => {
    const onSelect = vi.fn()
    renderHand({ isMyTurn: false, onSelect })
    const btn = screen.getByText('30').closest('button')
    expect(btn).toBeDisabled()
  })

  it('selected tile has different styling', () => {
    renderHand({ selectedTile: '30' })
    const btn = screen.getByText('30').closest('button')
    expect(btn.className).toMatch(/border-plasma|bg-hull/)
  })

  it('shows placeholder when tiles array is empty', () => {
    render(
      <DraftTileHand tiles={[]} tileByNumber={{}} isMyTurn={true} selectedTile={null} onSelect={vi.fn()} />
    )
    expect(screen.getByText(/hand empty/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftTileHand.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/game/DraftTileHand.jsx
export default function DraftTileHand({ tiles, tileByNumber, isMyTurn, selectedTile, onSelect }) {
  if (tiles.length === 0) {
    return <p className="text-muted text-sm">Hand empty</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="label">Your hand{!isMyTurn ? ' (waiting for your turn)' : ''}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tiles.map((tileNumber) => {
          const tile = tileByNumber[tileNumber] ?? {}
          const planets = tile.planets ?? []
          const totalR = planets.reduce((s, p) => s + (p.resources ?? 0), 0)
          const totalI = planets.reduce((s, p) => s + (p.influence ?? 0), 0)
          const isSelected = selectedTile === tileNumber

          return (
            <button
              key={tileNumber}
              disabled={!isMyTurn}
              onClick={() => onSelect(tileNumber)}
              className={`flex flex-col items-center p-2 rounded border min-w-[72px] transition-colors ${
                isSelected
                  ? 'border-plasma bg-hull'
                  : 'border-border bg-panel hover:border-muted'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-bright font-display text-lg leading-none">{tileNumber}</span>
              {planets.length > 0 ? (
                <span className="text-xs text-muted mt-1">{totalR}R / {totalI}I</span>
              ) : tile.anomaly ? (
                <span className="text-xs text-warning mt-1">{tile.anomaly}</span>
              ) : (
                <span className="text-xs text-muted mt-1">empty</span>
              )}
              {tile.wormhole && (
                <span className="text-xs text-success mt-0.5">⚬ {tile.wormhole}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftTileHand.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DraftTileHand.jsx tests/components/game/DraftTileHand.test.jsx
git commit -m "feat: add DraftTileHand component (Phase 39)"
```

---

## Task 9: `DraftSlicePickView` Component

**Files:**
- Create: `src/components/game/DraftSlicePickView.jsx`
- Create: `tests/components/game/DraftSlicePickView.test.jsx`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/components/game/DraftSlicePickView.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DraftSlicePickView from '../../../src/components/game/DraftSlicePickView.jsx'

const TILE_BY_NUMBER = {
  '20': { planets: [{ resources: 2, influence: 0 }], wormhole: null, anomaly: null },
  '21': { planets: [{ resources: 0, influence: 2 }], wormhole: null, anomaly: null },
  '22': { planets: [], wormhole: 'alpha', anomaly: null },
}

const SLICES = [
  { id: 0, tiles: ['20', '21'], score: 4, claimed_by: null },
  { id: 1, tiles: ['22'], score: 2, claimed_by: 'player-1' },
]

const DRAFT_STATE = {
  phase: 'slice-pick',
  slices: SLICES,
  pick_order: ['player-0', 'player-2'],
  pick_index: 0,
}

function renderView(props = {}) {
  return render(
    <DraftSlicePickView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      currentPlayer={{ id: 'player-0' }}
      onPickSlice={vi.fn()}
      pickError={null}
      {...props}
    />
  )
}

describe('DraftSlicePickView', () => {
  it('renders one card per slice', () => {
    renderView()
    expect(screen.getByText(/Slice 1/)).toBeInTheDocument()
    expect(screen.getByText(/Slice 2/)).toBeInTheDocument()
  })

  it('shows score for each slice', () => {
    renderView()
    expect(screen.getByText(/4/)).toBeInTheDocument()
  })

  it('claimed slice shows Claimed label', () => {
    renderView()
    expect(screen.getByText(/Claimed/i)).toBeInTheDocument()
  })

  it('active picker sees Pick button on unclaimed slice', () => {
    renderView()
    expect(screen.getByRole('button', { name: /pick this slice/i })).toBeInTheDocument()
  })

  it('non-active picker sees no Pick buttons', () => {
    renderView({ currentPlayer: { id: 'player-2' } }) // player-2 is not pick_order[0]
    expect(screen.queryByRole('button', { name: /pick this slice/i })).not.toBeInTheDocument()
  })

  it('clicking Pick calls onPickSlice with slice id', () => {
    const onPickSlice = vi.fn()
    renderView({ onPickSlice })
    fireEvent.click(screen.getByRole('button', { name: /pick this slice/i }))
    expect(onPickSlice).toHaveBeenCalledWith(0)
  })

  it('shows pickError when set', () => {
    renderView({ pickError: 'Slice already claimed' })
    expect(screen.getByText('Slice already claimed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftSlicePickView.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/game/DraftSlicePickView.jsx
export default function DraftSlicePickView({ draftState, tileByNumber, currentPlayer, onPickSlice, pickError }) {
  const activePicker = draftState.pick_order[draftState.pick_index]
  const isMyTurn = currentPlayer?.id === activePicker

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center p-3 rounded border border-plasma bg-panel">
        <span className="label">Milty Draft — Slice Pick</span>
        <span className="text-sm text-muted">
          {isMyTurn ? '▶ Your turn to pick' : 'Waiting for another player to pick...'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {draftState.slices.map((slice) => {
          const isClaimed = slice.claimed_by !== null
          const canPick = isMyTurn && !isClaimed

          return (
            <div
              key={slice.id}
              className={`panel flex flex-col gap-2 ${isClaimed ? 'opacity-50' : canPick ? 'border-plasma' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="label">Slice {slice.id + 1}</span>
                <span className="text-xs text-muted">Score: {typeof slice.score === 'number' ? slice.score.toFixed(1) : slice.score}</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {slice.tiles.map((tn) => {
                  const tile = tileByNumber[tn] ?? {}
                  const planets = tile.planets ?? []
                  const totalR = planets.reduce((s, p) => s + (p.resources ?? 0), 0)
                  const totalI = planets.reduce((s, p) => s + (p.influence ?? 0), 0)
                  return (
                    <span key={tn} className="text-xs bg-hull px-1.5 py-0.5 rounded">
                      {tn}
                      {planets.length > 0 ? ` · ${totalR}R/${totalI}I` : tile.anomaly ? ` · ${tile.anomaly}` : ''}
                      {tile.wormhole ? ` ⚬${tile.wormhole}` : ''}
                    </span>
                  )
                })}
              </div>

              {isClaimed && <p className="text-xs text-success">Claimed</p>}
              {canPick && (
                <button className="btn-primary text-sm mt-1" onClick={() => onPickSlice(slice.id)}>
                  Pick this slice
                </button>
              )}
            </div>
          )
        })}
      </div>

      {pickError && <p className="text-danger text-sm">{pickError}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftSlicePickView.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DraftSlicePickView.jsx tests/components/game/DraftSlicePickView.test.jsx
git commit -m "feat: add DraftSlicePickView component (Phase 39)"
```

---

## Task 10: `DraftPlacementView` Component

**Files:**
- Create: `src/components/game/DraftPlacementView.jsx`
- Create: `tests/components/game/DraftPlacementView.test.jsx`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/components/game/DraftPlacementView.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../src/components/game/HexMap.jsx', () => ({
  default: ({ onSelectSystem }) => (
    <div data-testid="hex-map">
      <button onClick={() => onSelectSystem?.('1,0')}>hex-1-0</button>
    </div>
  ),
}))
vi.mock('../../../src/components/game/DraftTileHand.jsx', () => ({
  default: ({ tiles, isMyTurn, onSelect }) => (
    <div data-testid="tile-hand">
      {tiles.map((t) => (
        <button key={t} disabled={!isMyTurn} onClick={() => onSelect(t)}>
          tile-{t}
        </button>
      ))}
    </div>
  ),
}))

import DraftPlacementView from '../../../src/components/game/DraftPlacementView.jsx'

const PLAYER_0 = { id: 'p0', display_name: 'Arborec' }
const PLAYER_1 = { id: 'p1', display_name: 'Vuil' }
const PLAYERS = [PLAYER_0, PLAYER_1]

const DRAFT_STATE = {
  mode: 'official',
  phase: 'placement',
  hands: { p0: ['30', '31'], p1: ['40'] },
  placement_order: ['p0', 'p1', 'p1', 'p0'],
  placement_index: 0,
  placed_tiles: {},
}

function renderView(props = {}) {
  return render(
    <DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={{ '30': { id: 't30', planets: [], wormhole: null, anomaly: null } }}
      tileDataById={{}}
      currentPlayer={PLAYER_0}
      players={PLAYERS}
      game={{ id: 'g1', expansions: { pok: false } }}
      onPlaceTile={vi.fn()}
      placeError={null}
      {...props}
    />
  )
}

describe('DraftPlacementView', () => {
  it('renders status bar with active player name', () => {
    renderView()
    expect(screen.getByText(/Arborec/)).toBeInTheDocument()
  })

  it('renders HexMap', () => {
    renderView()
    expect(screen.getByTestId('hex-map')).toBeInTheDocument()
  })

  it('renders DraftTileHand', () => {
    renderView()
    expect(screen.getByTestId('tile-hand')).toBeInTheDocument()
  })

  it('shows hint text when tile is selected', () => {
    renderView()
    fireEvent.click(screen.getByText('tile-30'))
    expect(screen.getByText(/click a valid hex/i)).toBeInTheDocument()
  })

  it('clicking hex after selecting tile calls onPlaceTile', () => {
    const onPlaceTile = vi.fn()
    renderView({ onPlaceTile })
    fireEvent.click(screen.getByText('tile-30'))
    fireEvent.click(screen.getByText('hex-1-0'))
    expect(onPlaceTile).toHaveBeenCalledWith('30', '1,0', 0)
  })

  it('clicking hex with no tile selected does not call onPlaceTile', () => {
    const onPlaceTile = vi.fn()
    renderView({ onPlaceTile })
    fireEvent.click(screen.getByText('hex-1-0'))
    expect(onPlaceTile).not.toHaveBeenCalled()
  })

  it('clicking same tile again deselects it', () => {
    renderView()
    fireEvent.click(screen.getByText('tile-30'))
    expect(screen.getByText(/click a valid hex/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('tile-30'))
    expect(screen.queryByText(/click a valid hex/i)).not.toBeInTheDocument()
  })

  it('non-active player: onPlaceTile not called from hex click', () => {
    const onPlaceTile = vi.fn()
    renderView({ currentPlayer: PLAYER_1, onPlaceTile })
    // PLAYER_1 is not the active placer (placement_order[0] = p0)
    fireEvent.click(screen.getByText('hex-1-0'))
    expect(onPlaceTile).not.toHaveBeenCalled()
  })

  it('shows placeError when set', () => {
    renderView({ placeError: 'Position occupied' })
    expect(screen.getByText('Position occupied')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftPlacementView.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/game/DraftPlacementView.jsx
import { useState } from 'react'
import HexMap from './HexMap.jsx'
import DraftTileHand from './DraftTileHand.jsx'

export default function DraftPlacementView({
  draftState, tileByNumber, tileDataById, currentPlayer, players, game,
  onPlaceTile, placeError,
}) {
  const [selectedTile, setSelectedTile] = useState(null)

  const activePlacer = draftState.placement_order[draftState.placement_index]
  const isMyTurn = currentPlayer?.id === activePlacer
  const myHand = currentPlayer ? (draftState.hands[currentPlayer.id] ?? []) : []

  const activePlayerName = players.find((p) => p.id === activePlacer)?.display_name ?? '...'
  const nextPlacer = draftState.placement_order[draftState.placement_index + 1]
  const nextPlayerName = nextPlacer
    ? (players.find((p) => p.id === nextPlacer)?.display_name ?? '...')
    : null

  const totalTiles = draftState.placement_order.length
  const currentTurn = draftState.placement_index + 1

  function handleHexClick(systemKey) {
    if (!isMyTurn || !selectedTile) return
    onPlaceTile(selectedTile, systemKey, 0)
    setSelectedTile(null)
  }

  function handleTileSelect(tileNumber) {
    setSelectedTile((prev) => (prev === tileNumber ? null : tileNumber))
  }

  const displayMapTiles = {
    '0,0': { tile_number: '18', tile_id: tileByNumber['18']?.id ?? null, rotation: 0 },
    ...Object.fromEntries(
      Object.entries(draftState.placed_tiles).map(([k, v]) => [
        k,
        { tile_number: v.tile_number, tile_id: tileByNumber[v.tile_number]?.id ?? null, rotation: v.rotation ?? 0 },
      ])
    ),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center p-3 rounded border border-hull bg-panel">
        <span className="label">Placement — Turn {currentTurn} of {totalTiles}</span>
        <span className="text-sm">
          ▶ <strong className="text-gold">{activePlayerName}</strong>
          {nextPlayerName && (
            <span className="text-muted text-xs"> (next: {nextPlayerName})</span>
          )}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 aspect-square max-h-[400px] bg-void rounded border border-hull overflow-hidden">
          <HexMap
            mapTiles={displayMapTiles}
            tileData={tileDataById}
            activations={[]}
            systemUnits={[]}
            planetOwnership={{}}
            players={players}
            onSelectSystem={handleHexClick}
            pokEnabled={game?.expansions?.pok ?? false}
          />
        </div>

        <div className="w-44 flex flex-col gap-3 shrink-0">
          <div className="panel">
            <p className="label mb-2">Up next</p>
            {draftState.placement_order
              .slice(draftState.placement_index, draftState.placement_index + 5)
              .map((pid, i) => {
                const pName = players.find((p) => p.id === pid)?.display_name ?? pid
                const remaining = (draftState.hands[pid] ?? []).length
                return (
                  <p
                    key={`${pid}-${i}`}
                    className={`text-xs ${i === 0 ? 'text-gold font-bold' : 'text-muted'}`}
                  >
                    {i === 0 ? '▶ ' : '  '}{pName} ({remaining})
                  </p>
                )
              })}
          </div>
        </div>
      </div>

      <DraftTileHand
        tiles={myHand}
        tileByNumber={tileByNumber}
        isMyTurn={isMyTurn}
        selectedTile={selectedTile}
        onSelect={handleTileSelect}
      />

      {selectedTile && isMyTurn && (
        <p className="text-sm text-muted">
          Tile <span className="text-bright">{selectedTile}</span> selected — click a valid hex to place it
        </p>
      )}
      {placeError && <p className="text-danger text-sm">{placeError}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftPlacementView.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DraftPlacementView.jsx tests/components/game/DraftPlacementView.test.jsx
git commit -m "feat: add DraftPlacementView component (Phase 39)"
```

---

## Task 11: `DraftPanel` Component

**Files:**
- Create: `src/components/game/DraftPanel.jsx`
- Create: `tests/components/game/DraftPanel.test.jsx`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/components/game/DraftPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../src/components/game/DraftSlicePickView.jsx', () => ({
  default: ({ pickError, onPickSlice }) => (
    <div data-testid="slice-pick-view">
      <button onClick={() => onPickSlice(0)}>pick</button>
      {pickError && <span data-testid="pick-error">{pickError}</span>}
    </div>
  ),
}))
vi.mock('../../../src/components/game/DraftPlacementView.jsx', () => ({
  default: ({ placeError, onPlaceTile }) => (
    <div data-testid="placement-view">
      <button onClick={() => onPlaceTile('30', '1,0', 0)}>place</button>
      {placeError && <span data-testid="place-error">{placeError}</span>}
    </div>
  ),
}))

import DraftPanel from '../../../src/components/game/DraftPanel.jsx'

const SLICE_PICK_STATE = { phase: 'slice-pick', slices: [], pick_order: [], pick_index: 0 }
const PLACEMENT_STATE = { phase: 'placement', hands: {}, placement_order: [], placement_index: 0, placed_tiles: {} }

function renderPanel(draftState, overrides = {}) {
  return render(
    <DraftPanel
      draftState={draftState}
      tileByNumber={{}}
      tileDataById={{}}
      currentPlayer={{ id: 'p0' }}
      players={[]}
      game={{ id: 'g1' }}
      onPickSlice={vi.fn()}
      onPlaceTile={vi.fn()}
      {...overrides}
    />
  )
}

describe('DraftPanel', () => {
  it('renders DraftSlicePickView when phase=slice-pick', () => {
    renderPanel(SLICE_PICK_STATE)
    expect(screen.getByTestId('slice-pick-view')).toBeInTheDocument()
    expect(screen.queryByTestId('placement-view')).not.toBeInTheDocument()
  })

  it('renders DraftPlacementView when phase=placement', () => {
    renderPanel(PLACEMENT_STATE)
    expect(screen.getByTestId('placement-view')).toBeInTheDocument()
    expect(screen.queryByTestId('slice-pick-view')).not.toBeInTheDocument()
  })

  it('renders nothing when phase=complete', () => {
    const { container } = renderPanel({ phase: 'complete' })
    expect(container.firstChild).toBeNull()
  })

  it('shows pickError in DraftSlicePickView after failed pick', async () => {
    const onPickSlice = vi.fn().mockRejectedValue(new Error('Slice already claimed'))
    renderPanel(SLICE_PICK_STATE, { onPickSlice })
    fireEvent.click(screen.getByText('pick'))
    await waitFor(() => {
      expect(screen.getByTestId('pick-error')).toHaveTextContent('Slice already claimed')
    })
  })

  it('shows placeError in DraftPlacementView after failed place', async () => {
    const onPlaceTile = vi.fn().mockRejectedValue(new Error('Position occupied'))
    renderPanel(PLACEMENT_STATE, { onPlaceTile })
    fireEvent.click(screen.getByText('place'))
    await waitFor(() => {
      expect(screen.getByTestId('place-error')).toHaveTextContent('Position occupied')
    })
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftPanel.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/game/DraftPanel.jsx
import { useState } from 'react'
import DraftSlicePickView from './DraftSlicePickView.jsx'
import DraftPlacementView from './DraftPlacementView.jsx'

export default function DraftPanel({
  draftState, tileByNumber, tileDataById, currentPlayer, players, game,
  onPickSlice, onPlaceTile,
}) {
  const [pickError, setPickError] = useState(null)
  const [placeError, setPlaceError] = useState(null)

  async function handlePickSlice(sliceId) {
    setPickError(null)
    try {
      await onPickSlice(sliceId)
    } catch (e) {
      setPickError(e.message)
    }
  }

  async function handlePlaceTile(tileNumber, position, rotation) {
    setPlaceError(null)
    try {
      await onPlaceTile(tileNumber, position, rotation)
    } catch (e) {
      setPlaceError(e.message)
    }
  }

  if (draftState.phase === 'slice-pick') {
    return (
      <DraftSlicePickView
        draftState={draftState}
        tileByNumber={tileByNumber}
        currentPlayer={currentPlayer}
        onPickSlice={handlePickSlice}
        pickError={pickError}
      />
    )
  }

  if (draftState.phase === 'placement') {
    return (
      <DraftPlacementView
        draftState={draftState}
        tileByNumber={tileByNumber}
        tileDataById={tileDataById}
        currentPlayer={currentPlayer}
        players={players}
        game={game}
        onPlaceTile={handlePlaceTile}
        placeError={placeError}
      />
    )
  }

  return null
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/DraftPanel.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DraftPanel.jsx tests/components/game/DraftPanel.test.jsx
git commit -m "feat: add DraftPanel component (Phase 39)"
```

---

## Task 12: `LobbyScreen` Integration

**Files:**
- Modify: `src/components/game/LobbyScreen.jsx`
- Modify: `tests/components/game/LobbyScreen.test.jsx`

- [ ] **Step 1: Add failing tests to the existing LobbyScreen test file**

Open `tests/components/game/LobbyScreen.test.jsx`. Add the following mocks at the top of the file alongside existing mocks:

```javascript
// Add to existing vi.mock block in LobbyScreen.test.jsx:
vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  updateGameSettings: vi.fn().mockResolvedValue({}),
  addBot: vi.fn().mockResolvedValue({}),
  removeBot: vi.fn().mockResolvedValue({}),
  startDraft: vi.fn().mockResolvedValue({}),    // ADD
  draftPickSlice: vi.fn().mockResolvedValue({}), // ADD
  draftPlaceTile: vi.fn().mockResolvedValue({}), // ADD
}))

vi.mock('../../../src/components/game/DraftPanel.jsx', () => ({
  default: () => <div data-testid="draft-panel" />,
}))
```

Add the following import to the test:

```javascript
import { startDraft } from '../../../src/lib/edgeFunctions.js'
```

Add these test cases to the existing `describe('LobbyScreen')` block:

```javascript
// Draft setup tests — add inside the existing describe block

it('host sees "In-App Draft" option in setup method toggle', () => {
  mockSupabase()
  mockGame({ isHost: true })
  renderLobby()
  expect(screen.getByRole('button', { name: /in-app draft/i })).toBeInTheDocument()
})

it('non-host does not see draft toggle', () => {
  mockSupabase()
  mockGame({ isHost: false })
  renderLobby()
  expect(screen.queryByRole('button', { name: /in-app draft/i })).not.toBeInTheDocument()
})

it('host clicking In-App Draft shows Start Draft button', async () => {
  mockSupabase()
  mockGame({ isHost: true })
  renderLobby()
  fireEvent.click(screen.getByRole('button', { name: /in-app draft/i }))
  expect(screen.getByRole('button', { name: /start draft/i })).toBeInTheDocument()
})

it('Start Draft button calls startDraft with game id and selected mode', async () => {
  mockSupabase()
  mockGame({ isHost: true })
  renderLobby()
  fireEvent.click(screen.getByRole('button', { name: /in-app draft/i }))
  fireEvent.click(screen.getByRole('button', { name: /start draft/i }))
  await waitFor(() => {
    expect(startDraft).toHaveBeenCalledWith('game-uuid', expect.stringMatching(/official|milty/))
  })
})

it('shows DraftPanel for all players when game.draft_state is set', () => {
  mockSupabase()
  mockGame({
    isHost: false,
    game: {
      id: 'game-uuid',
      code: 'ABC123',
      status: 'lobby',
      host_user_id: 'other-user',
      expansions: {},
      draft_state: { phase: 'placement', hands: {}, placement_order: [], placement_index: 0, placed_tiles: {} },
    },
  })
  renderLobby()
  expect(screen.getByTestId('draft-panel')).toBeInTheDocument()
})

it('does not show DraftPanel when draft_state is null', () => {
  mockSupabase()
  mockGame({ isHost: true })
  renderLobby()
  expect(screen.queryByTestId('draft-panel')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the new tests and confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/LobbyScreen.test.jsx
```

Expected: new tests FAIL, existing tests still pass.

- [ ] **Step 3: Extend the tiles query in LobbyScreen**

In `src/components/game/LobbyScreen.jsx`, locate the tiles `useEffect` and update the select:

```javascript
// Change:
supabase.from('tiles').select('id, tile_number, wormhole')
// To:
supabase.from('tiles').select('id, tile_number, wormhole, planets, anomaly, type, name')
```

In the same effect, build `tileDataById` alongside `tileByNumber`:

```javascript
useEffect(() => {
  supabase.from('tiles').select('id, tile_number, wormhole, planets, anomaly, type, name')
    .then(({ data }) => {
      const byNumber = {}
      const byId = {}
      for (const t of data ?? []) {
        byNumber[t.tile_number] = t
        byId[t.id] = t
      }
      setTileByNumber(byNumber)
      setTileDataById(byId)
    })
}, [])
```

Add `tileDataById` state near `tileByNumber`:

```javascript
const [tileDataById, setTileDataById] = useState({})
```

- [ ] **Step 4: Add draft UI state to LobbyScreen**

Add these state variables near the existing map builder state:

```javascript
const [mapSetupMethod, setMapSetupMethod] = useState('string') // 'string' | 'draft'
const [draftMode, setDraftMode] = useState('official')
const [startDraftError, setStartDraftError] = useState(null)
```

- [ ] **Step 5: Add import and handler**

Add `startDraft` to the edgeFunctions import at the top:

```javascript
import { updateGameSettings, addBot, removeBot, startDraft as startDraftFn,
         draftPickSlice as draftPickSliceFn, draftPlaceTile as draftPlaceTileFn } from '../../lib/edgeFunctions.js'
```

Add the handler function near the other handlers:

```javascript
async function handleStartDraft() {
  setStartDraftError(null)
  try {
    await startDraftFn(game.id, draftMode)
  } catch (e) {
    setStartDraftError(e.message)
  }
}
```

- [ ] **Step 6: Add DraftPanel import**

```javascript
import DraftPanel from '../game/DraftPanel.jsx'
```

- [ ] **Step 7: Add the draft UI to the render output**

Locate the host-only map configuration section. Replace it with the following structure. The key changes are: (a) a setup method toggle, (b) the draft UI when "In-App Draft" is selected, (c) the DraftPanel shown to all players when a draft is active.

Find the section that renders the `MapPreviewSection` and the host map string controls, and add this above the `MapPreviewSection`:

```jsx
{/* Draft panel — shown to all players when a draft is in progress */}
{game.draft_state && (
  <DraftPanel
    draftState={game.draft_state}
    tileByNumber={tileByNumber}
    tileDataById={tileDataById}
    currentPlayer={currentPlayer}
    players={players}
    game={game}
    onPickSlice={(sliceId) => draftPickSliceFn(game.id, sliceId)}
    onPlaceTile={(tileNumber, position, rotation) => draftPlaceTileFn(game.id, tileNumber, position, rotation)}
  />
)}

{/* Host-only map setup controls — only when no draft active */}
{isHost && !game.draft_state && (
  <div className="flex flex-col gap-3">
    {/* Setup method toggle */}
    <div className="flex gap-2">
      <button
        className={`btn-ghost text-sm ${mapSetupMethod === 'string' ? 'border-plasma' : ''}`}
        onClick={() => setMapSetupMethod('string')}
      >
        Paste Map String
      </button>
      <button
        className={`btn-ghost text-sm ${mapSetupMethod === 'draft' ? 'border-plasma' : ''}`}
        onClick={() => setMapSetupMethod('draft')}
      >
        In-App Draft
      </button>
    </div>

    {/* Draft mode UI */}
    {mapSetupMethod === 'draft' && (
      <div className="panel flex flex-col gap-3">
        <div className="flex gap-4 items-center">
          <span className="label">Draft mode:</span>
          <label className="flex gap-1.5 items-center text-sm cursor-pointer">
            <input type="radio" name="draftMode" value="official"
              checked={draftMode === 'official'} onChange={() => setDraftMode('official')} />
            Official (random deal)
          </label>
          <label className="flex gap-1.5 items-center text-sm cursor-pointer">
            <input type="radio" name="draftMode" value="milty"
              checked={draftMode === 'milty'} onChange={() => setDraftMode('milty')} />
            Milty (balanced slices)
          </label>
        </div>
        <button className="btn-primary w-fit" onClick={handleStartDraft}>
          Start Draft →
        </button>
        {startDraftError && <p className="text-danger text-sm">{startDraftError}</p>}
      </div>
    )}

    {/* Existing map string UI — only when 'string' method selected */}
    {mapSetupMethod === 'string' && (
      /* --- EXISTING MAP STRING / PRESET UI GOES HERE (no changes needed) --- */
      null /* placeholder — leave existing JSX in place */
    )}
  </div>
)}
```

> **Note:** Replace the `null` placeholder with the existing map string/preset JSX that was already there before this change. Do not delete that code — wrap it inside the `mapSetupMethod === 'string'` conditional.

- [ ] **Step 8: Run all LobbyScreen tests**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/LobbyScreen.test.jsx
```

Expected: all tests (old and new) pass.

- [ ] **Step 9: Run the full test suite**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests pass. Note the new total count.

- [ ] **Step 10: Commit**

```bash
git add src/components/game/LobbyScreen.jsx tests/components/game/LobbyScreen.test.jsx
git commit -m "feat: integrate DraftPanel into LobbyScreen with setup method toggle (Phase 39)"
```

---

## Task 13: Deploy Edge Functions + Smoke Test

- [ ] **Step 1: Deploy the three new edge functions**

```bash
cd supabase
supabase functions deploy game-start-draft --no-verify-jwt
supabase functions deploy game-draft-pick-slice --no-verify-jwt
supabase functions deploy game-draft-place-tile --no-verify-jwt
```

Expected: each deployment succeeds with no errors.

- [ ] **Step 2: Smoke test Official mode**

1. Open the app and log in
2. Create a game and join with at least 3 players (or add bots in the lobby)
3. As host: click **In-App Draft** → select **Official** → click **Start Draft →**
4. Verify the `DraftPanel` appears for all connected players
5. As the active player: select a tile from your hand → click a ring-1 hex
6. Verify the tile appears on the map and the turn advances to the next player
7. Repeat until all tiles are placed
8. Verify `games.map_tiles` is populated and `draft_state` is null in the Supabase dashboard
9. Verify the `MapPreviewSection` now shows the completed map

- [ ] **Step 3: Smoke test Milty mode**

1. Repeat setup from Step 2
2. Select **Milty** mode → click **Start Draft →**
3. Verify the slice-pick grid appears with N balanced slices
4. Each player picks a slice in reverse-speaker order
5. After all slices are claimed, verify automatic transition to placement phase
6. Complete placement as in Official mode
7. Verify final map is populated correctly

- [ ] **Step 4: Update `_index.md` status to `done` for all Phase 39 entries**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all Phase 39 entries from `planned` to `done`.

- [ ] **Step 5: Final commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 39 in-app map draft as done in _index.md"
```
