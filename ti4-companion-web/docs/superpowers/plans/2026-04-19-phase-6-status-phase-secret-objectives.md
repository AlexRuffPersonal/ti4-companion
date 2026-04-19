# Phase 6 — Status Phase + Secret Objectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the per-round game loop with status phase, secret objective dealing/scoring, and post-status token redistribution.

**Architecture:** One migration adds three columns to `game_players` and a `deck_position` to `game_player_secret_objectives`. Five Edge Functions cover the full flow (game-start patched, two new objective functions, game-status-phase, game-update-command-tokens patched). Blocking UI gates for secret selection and token redistribution are driven by the two new boolean flags via the existing Realtime subscription.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react, Deno/TypeScript (Edge Functions)

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/024_phase6.sql` |
| Modify | `supabase/functions/game-start/index.ts` |
| Create | `supabase/functions/game-discard-secret-objective/index.ts` |
| Create | `supabase/functions/game-score-secret-objective/index.ts` |
| Create | `supabase/functions/game-status-phase/index.ts` |
| Modify | `supabase/functions/game-update-command-tokens/index.ts` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Modify | `ti4-companion-web/src/hooks/useGame.js` |
| Create | `ti4-companion-web/src/components/game/SecretObjectiveSelectionScreen.jsx` |
| Create | `ti4-companion-web/src/components/game/SecretObjectivesModal.jsx` |
| Create | `ti4-companion-web/src/components/game/TokenRedistributionModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/ObjectivesSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/HostControlsSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/ScoreboardSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Modify | `ti4-companion-web/tests/functions/game-start.test.js` |
| Create | `ti4-companion-web/tests/functions/game-discard-secret-objective.test.js` |
| Create | `ti4-companion-web/tests/functions/game-score-secret-objective.test.js` |
| Create | `ti4-companion-web/tests/functions/game-status-phase.test.js` |
| Create | `ti4-companion-web/tests/functions/game-update-command-tokens.phase6.test.js` |
| Create | `ti4-companion-web/tests/lib/edgeFunctions.phase6.test.js` |
| Create | `ti4-companion-web/tests/hooks/useGame.phase6.test.js` |
| Create | `ti4-companion-web/tests/components/game/SecretObjectiveSelectionScreen.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/SecretObjectivesModal.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/TokenRedistributionModal.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/HostControlsSection.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx` |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/024_phase6.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Phase 6: Status Phase + Secret Objectives
-- Adds player flags for blocking UI gates and secret objective tracking.
-- Also adds deck_position to game_player_secret_objectives (missing from initial schema).

ALTER TABLE public.game_players
  ADD COLUMN secrets_selected       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tokens_redistributed   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN secret_objective_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.game_player_secret_objectives
  ADD COLUMN deck_position INTEGER;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/024_phase6.sql
git commit -m "feat: add phase6 migration — secrets_selected, tokens_redistributed, secret_objective_count"
```

---

## Task 2: game-start patch — deal secret objectives

**Files:**
- Modify: `supabase/functions/game-start/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-start.test.js`

`game_player_secret_objectives.player_id` references `game_players.id` (not `user_id`). The mock needs to cover the two new tables: `secret_objectives` (for fetching) and a new insert mock for `game_player_secret_objectives`.

- [ ] **Step 1: Add failing tests to `tests/functions/game-start.test.js`**

In `mockDb()`, add two new parameters and two new table handlers. Insert them into the existing `mockDb` function signature and `db.from.mockImplementation` switch:

Add to `mockDb` parameter destructuring (after `techUpdateError`):
```js
  secretObjectives = [
    { id: 'so-1', expansion: 'base' },
    { id: 'so-2', expansion: 'base' },
    { id: 'so-3', expansion: 'base' },
    { id: 'so-4', expansion: 'base' },
  ],
  insertSecretsError = null,
```

Add to `db.from.mockImplementation` (after the `game_player_planets` block):
```js
    if (table === 'secret_objectives') {
      return {
        select: vi.fn().mockResolvedValue({ data: secretObjectives, error: null }),
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertSecretsError }),
      }
    }
```

Add these tests inside the `describe('game-start', ...)` block:
```js
  it('deals exactly 2 secret objectives per player', async () => {
    const secretInsertMock = vi.fn().mockResolvedValue({ error: null })
    mockDb()
    // Override just the secret objectives insert
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_player_secret_objectives') return { insert: secretInsertMock }
      return originalImpl(table)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(secretInsertMock).toHaveBeenCalledOnce()
    const inserted = secretInsertMock.mock.calls[0][0]
    // 2 players × 2 secrets each = 4 rows
    expect(inserted).toHaveLength(4)
    expect(inserted.filter(r => r.player_id === 'p1')).toHaveLength(2)
    expect(inserted.filter(r => r.player_id === 'p2')).toHaveLength(2)
    inserted.forEach(r => expect(r.state).toBe('held'))
  })

  it('returns 409 when secret objective deck is too small for all players', async () => {
    // 2 players × 2 = 4 needed; only 3 in deck
    mockDb({ secretObjectives: [
      { id: 'so-1', expansion: 'base' },
      { id: 'so-2', expansion: 'base' },
      { id: 'so-3', expansion: 'base' },
    ]})
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not enough secret objectives/i)
  })

  it('filters secret objectives by active expansions', async () => {
    const secretInsertMock = vi.fn().mockResolvedValue({ error: null })
    mockDb({
      gameData: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID, expansions: { base: true, pok: false } },
      secretObjectives: [
        { id: 'so-1', expansion: 'base' },
        { id: 'so-2', expansion: 'base' },
        { id: 'so-3', expansion: 'base' },
        { id: 'so-4', expansion: 'base' },
        { id: 'so-pok', expansion: 'pok' },
      ],
    })
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_player_secret_objectives') return { insert: secretInsertMock }
      return originalImpl(table)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const inserted = secretInsertMock.mock.calls[0][0]
    // only base objectives dealt; pok filtered out
    inserted.forEach(r => {
      expect(['so-1', 'so-2', 'so-3', 'so-4']).toContain(r.secret_objective_id)
    })
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-start.test.js
```

Expected: the three new tests FAIL; existing tests pass.

- [ ] **Step 3: Implement the secret objectives dealing in `game-start/index.ts`**

After the action cards block (before the per-player loop), add:

```typescript
  // Deal 2 secret objectives per player
  const { data: allSecrets, error: secretsError } = await db
    .from('secret_objectives')
    .select('id, expansion')
  if (secretsError) return errorResponse('Database error', 500)

  const eligibleSecrets = (allSecrets ?? []).filter(
    (s: { id: string; expansion: string }) =>
      activeExpansions.includes(s.expansion ?? 'base')
  )

  const secretsNeeded = players.length * 2
  if (eligibleSecrets.length < secretsNeeded) {
    return errorResponse(
      `Not enough secret objectives in the deck (need ${secretsNeeded}, have ${eligibleSecrets.length})`,
      409
    )
  }

  // Shuffle eligible secrets
  const shuffledSecrets = [...eligibleSecrets]
  for (let i = shuffledSecrets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledSecrets[i], shuffledSecrets[j]] = [shuffledSecrets[j], shuffledSecrets[i]]
  }

  // Deal 2 to each player
  const secretRows: Array<{ game_id: string; player_id: string; secret_objective_id: string; state: string }> = []
  let secretIdx = 0
  for (const player of players) {
    secretRows.push({ game_id: body.game_id, player_id: player.id, secret_objective_id: shuffledSecrets[secretIdx++].id, state: 'held' })
    secretRows.push({ game_id: body.game_id, player_id: player.id, secret_objective_id: shuffledSecrets[secretIdx++].id, state: 'held' })
  }

  const { error: insertSecretsError } = await db
    .from('game_player_secret_objectives')
    .insert(secretRows)
  if (insertSecretsError) return errorResponse(`Failed to deal secret objectives: ${insertSecretsError.message}`, 500)
```

Note: The column is `secret_objective_id` not `objective_id` — check the migration to confirm. If the existing schema uses `objective_id`, use that instead.

> **Check:** Run `grep 'objective_id' supabase/migrations/004_gameplay.sql` to confirm the column name. Update the `secretRows` field accordingly.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-start.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-start/index.ts tests/functions/game-start.test.js
git commit -m "feat: deal 2 secret objectives per player at game start"
```

---

## Task 3: game-discard-secret-objective

**Files:**
- Create: `ti4-companion-web/tests/functions/game-discard-secret-objective.test.js`
- Create: `supabase/functions/game-discard-secret-objective/index.ts`

The function looks up `game_players` by `user_id`, then queries `game_player_secret_objectives` twice (once for the row, once for deck count), then updates. The mock distinguishes the two `select` calls by the presence of `{ count: 'exact' }` in the options.

- [ ] **Step 1: Write the failing test file**

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
import { handler } from '../../../supabase/functions/game-discard-secret-objective/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OBJ_ID = 'obj-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-discard-secret-objective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, secrets_selected: false },
  playerError = null,
  row = { id: OBJ_ID, state: 'held', player_id: PLAYER_ID },
  rowError = null,
  deckSize = 3,
  deckCountError = null,
  updateObjError = null,
  updatePlayerError = null,
} = {}) {
  const updateObjMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateObjError }),
  })
  const updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updatePlayerError }),
  })

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
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn((fields, opts) => {
          if (opts && opts.count === 'exact') {
            // deck count query
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: deckSize, error: deckCountError }),
              }),
            }
          }
          // row fetch query
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: row, error: rowError }),
            }),
          }
        }),
        update: updateObjMock,
      }
    }
  })
  return { updateObjMock, updatePlayerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-discard-secret-objective', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when objective_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when caller is not in the game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when objective row does not exist', async () => {
    mockDb({ row: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when objective is not held', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'deck', player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not held/i)
  })

  it('returns 403 when caller does not hold the objective', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 and discards on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(true)
  })

  it('sets objective state to deck and clears player_id', async () => {
    const { updateObjMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updateObjMock).toHaveBeenCalledOnce()
    const updateArg = updateObjMock.mock.calls[0][0]
    expect(updateArg.state).toBe('deck')
    expect(updateArg.player_id).toBeNull()
    expect(typeof updateArg.deck_position).toBe('number')
  })

  it('deck_position is within [0, deck_size]', async () => {
    const { updateObjMock } = mockDb({ deckSize: 5 })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    const pos = updateObjMock.mock.calls[0][0].deck_position
    expect(pos).toBeGreaterThanOrEqual(0)
    expect(pos).toBeLessThanOrEqual(5)
  })

  it('sets secrets_selected = true when it was false', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, secrets_selected: false } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).toHaveBeenCalledOnce()
    expect(updatePlayerMock.mock.calls[0][0]).toMatchObject({ secrets_selected: true })
  })

  it('does not update secrets_selected when it was already true', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, secrets_selected: true } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).not.toHaveBeenCalled()
  })

  it('is callable during standard game (no phase guard)', async () => {
    // No phase check — just verifies the function does not reject with a phase error
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/functions/game-discard-secret-objective.test.js
```

Expected: FAIL — handler import fails (file does not exist).

- [ ] **Step 3: Implement `game-discard-secret-objective/index.ts`**

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

  let body: { game_id?: unknown; objective_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, secrets_selected')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: row, error: rowError } = await db
    .from('game_player_secret_objectives')
    .select('id, state, player_id')
    .eq('id', body.objective_id)
    .maybeSingle()
  if (rowError) return errorResponse('Database error', 500)
  if (!row) return errorResponse('Secret objective not found', 404)
  if (row.state !== 'held') return errorResponse('Objective is not held', 409)
  if (row.player_id !== player.id) return errorResponse('You do not hold this objective', 403)

  const { count: deckSize, error: countError } = await db
    .from('game_player_secret_objectives')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
  if (countError) return errorResponse('Database error', 500)

  const deckCount = deckSize ?? 0
  const deckPosition = Math.floor(Math.random() * (deckCount + 1))

  const { error: updateError } = await db
    .from('game_player_secret_objectives')
    .update({ state: 'deck', player_id: null, deck_position: deckPosition })
    .eq('id', body.objective_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  if (!player.secrets_selected) {
    const { error: flagError } = await db
      .from('game_players')
      .update({ secrets_selected: true })
      .eq('id', player.id)
    if (flagError) return errorResponse(`Update failed: ${flagError.message}`, 500)
  }

  return okResponse({ discarded: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-discard-secret-objective.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-discard-secret-objective/index.ts tests/functions/game-discard-secret-objective.test.js
git commit -m "feat: add game-discard-secret-objective edge function"
```

---

## Task 4: game-score-secret-objective

**Files:**
- Create: `ti4-companion-web/tests/functions/game-score-secret-objective.test.js`
- Create: `supabase/functions/game-score-secret-objective/index.ts`

The function validates: caller holds the objective, `game.phase` matches `secret_objectives.timing`, caller hasn't scored a secret this round. On success: set state to scored, record round, increment VP and `secret_objective_count`.

- [ ] **Step 1: Write the failing test file**

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
import { handler } from '../../../supabase/functions/game-score-secret-objective/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OBJ_ID = 'obj-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-score-secret-objective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, vp: 3, secret_objective_count: 0 },
  playerError = null,
  game = { id: GAME_ID, phase: 'status', round: 2 },
  gameError = null,
  row = { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } },
  rowError = null,
  alreadyScoredCount = 0,
  scoredCountError = null,
  updateObjError = null,
  updatePlayerError = null,
} = {}) {
  const updateObjMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateObjError }),
  })
  const updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updatePlayerError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn((fields, opts) => {
          if (opts && opts.count === 'exact') {
            // already-scored-this-round count
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: alreadyScoredCount, error: scoredCountError }),
                }),
              }),
            }
          }
          // objective row fetch
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: row, error: rowError }),
            }),
          }
        }),
        update: updateObjMock,
      }
    }
  })
  return { updateObjMock, updatePlayerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-score-secret-objective', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when player is not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when objective row is not found', async () => {
    mockDb({ row: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when objective is not held', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'scored', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not held/i)
  })

  it('returns 403 when caller does not hold the objective', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: 'other-player', secret_objectives: { timing: 'status' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when game phase does not match objective timing', async () => {
    mockDb({
      game: { id: GAME_ID, phase: 'action', round: 2 },
      row: { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/timing/i)
  })

  it('returns 409 when caller already scored a secret this round', async () => {
    mockDb({ alreadyScoredCount: 1 })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already scored/i)
  })

  it('returns 200 and scores on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scored).toBe(true)
  })

  it('sets objective state to scored with scored_at_round', async () => {
    const { updateObjMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updateObjMock).toHaveBeenCalledOnce()
    expect(updateObjMock.mock.calls[0][0]).toMatchObject({ state: 'scored', scored_at_round: 2 })
  })

  it('increments player vp by 1 and secret_objective_count by 1', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, vp: 3, secret_objective_count: 1 } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).toHaveBeenCalledOnce()
    expect(updatePlayerMock.mock.calls[0][0]).toMatchObject({ vp: 4, secret_objective_count: 2 })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/functions/game-score-secret-objective.test.js
```

Expected: FAIL — import error.

- [ ] **Step 3: Implement `game-score-secret-objective/index.ts`**

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

  let body: { game_id?: unknown; objective_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, vp, secret_objective_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, phase, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: row, error: rowError } = await db
    .from('game_player_secret_objectives')
    .select('id, state, player_id, secret_objectives(timing)')
    .eq('id', body.objective_id)
    .maybeSingle()
  if (rowError) return errorResponse('Database error', 500)
  if (!row) return errorResponse('Secret objective not found', 404)
  if (row.state !== 'held') return errorResponse('Objective is not held', 409)
  if (row.player_id !== player.id) return errorResponse('You do not hold this objective', 403)

  const timing = (row.secret_objectives as { timing: string } | null)?.timing
  if (timing && timing !== game.phase) {
    return errorResponse(`Cannot score: objective timing '${timing}' does not match current phase '${game.phase}'`, 409)
  }

  const { count: scoredCount, error: scoredCountError } = await db
    .from('game_player_secret_objectives')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .eq('state', 'scored')
    .eq('scored_at_round', game.round)
  if (scoredCountError) return errorResponse('Database error', 500)
  if ((scoredCount ?? 0) > 0) {
    return errorResponse('You have already scored a secret objective this round', 409)
  }

  const { error: updateObjError } = await db
    .from('game_player_secret_objectives')
    .update({ state: 'scored', scored_at_round: game.round })
    .eq('id', body.objective_id)
  if (updateObjError) return errorResponse(`Update failed: ${updateObjError.message}`, 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ vp: player.vp + 1, secret_objective_count: (player.secret_objective_count ?? 0) + 1 })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse(`Update failed: ${updatePlayerError.message}`, 500)

  return okResponse({ scored: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-score-secret-objective.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-score-secret-objective/index.ts tests/functions/game-score-secret-objective.test.js
git commit -m "feat: add game-score-secret-objective edge function"
```

---

## Task 5: game-status-phase

**Files:**
- Create: `ti4-companion-web/tests/functions/game-status-phase.test.js`
- Create: `supabase/functions/game-status-phase/index.ts`

The function validates all players passed, then atomically: readies planets, repairs units, clears activations, grants +2 tactic to each player, resets `tokens_redistributed = false`, resets `passed = false`, increments round, sets phase to 'strategy'. Speaker is NOT changed.

- [ ] **Step 1: Write the failing test file**

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
import { handler } from '../../../supabase/functions/game-status-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-status-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const PASSED_PLAYERS = [
  { id: 'p1', passed: true, command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } },
  { id: 'p2', passed: true, command_tokens: { tactic_total: 1, fleet: 4, strategy: 2 } },
]

function mockDb({
  game = { id: GAME_ID, host_user_id: HOST_ID, permissions_mode: 'host', phase: 'status', round: 2 },
  gameError = null,
  players = PASSED_PLAYERS,
  playersError = null,
  readyPlanetsError = null,
  repairUnitsError = null,
  deleteActivationsError = null,
  updatePlayerError = null,
  updateGameError = null,
} = {}) {
  const updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })
  const updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updatePlayerError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
        update: updateGameMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: readyPlanetsError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: repairUnitsError }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: deleteActivationsError }),
        }),
      }
    }
  })
  return { updateGameMock, updatePlayerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-status-phase', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host (host mode)', async () => {
    requireAuth.mockResolvedValue('not-the-host')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('allows non-host when permissions_mode is all', async () => {
    mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, permissions_mode: 'all', phase: 'status', round: 2 } })
    requireAuth.mockResolvedValue('any-player')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('returns 409 when a player has not passed', async () => {
    mockDb({ players: [
      { id: 'p1', passed: true,  command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } },
      { id: 'p2', passed: false, command_tokens: { tactic_total: 1, fleet: 4, strategy: 2 } },
    ]})
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not all players have passed/i)
  })

  it('returns 200 on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
  })

  it('grants each player +2 tactic tokens', async () => {
    const { updatePlayerMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    // called once per player with tactic incremented
    const calls = updatePlayerMock.mock.calls
    const p1Call = calls.find(c => c[1] === 'p1' || (c[0].command_tokens?.tactic_total === 4))
    expect(calls.some(c => c[0].command_tokens?.tactic_total === 4)).toBe(true) // p1: 2+2
    expect(calls.some(c => c[0].command_tokens?.tactic_total === 3)).toBe(true) // p2: 1+2
  })

  it('sets tokens_redistributed = false for all players', async () => {
    const { updatePlayerMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    const allCalls = updatePlayerMock.mock.calls
    allCalls.forEach(call => {
      expect(call[0]).toMatchObject({ tokens_redistributed: false, passed: false })
    })
  })

  it('increments round and sets phase to strategy', async () => {
    const { updateGameMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledOnce()
    expect(updateGameMock.mock.calls[0][0]).toMatchObject({ round: 3, phase: 'strategy' })
  })

  it('does not change speaker_player_id', async () => {
    const { updateGameMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    const updateArg = updateGameMock.mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('speaker_player_id')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/functions/game-status-phase.test.js
```

- [ ] **Step 3: Implement `game-status-phase/index.ts`**

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

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, host_user_id, permissions_mode, phase, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  if (game.permissions_mode !== 'all' && game.host_user_id !== userId) {
    return errorResponse('Only the host can end the status phase', 403)
  }

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, passed, command_tokens')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)

  const allPassed = (players ?? []).every((p: { passed: boolean }) => p.passed)
  if (!allPassed) return errorResponse('Not all players have passed', 409)

  // Ready all planets
  const { error: planetsError } = await db
    .from('game_player_planets')
    .update({ exhausted: false })
    .eq('game_id', body.game_id)
  if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

  // Repair all units
  const { error: unitsError } = await db
    .from('game_player_units')
    .update({ damaged_count: 0 })
    .eq('game_id', body.game_id)
  if (unitsError) return errorResponse(`Failed to repair units: ${unitsError.message}`, 500)

  // Clear system activations
  const { error: activationsError } = await db
    .from('game_system_activations')
    .delete()
    .eq('game_id', body.game_id)
  if (activationsError) return errorResponse(`Failed to clear activations: ${activationsError.message}`, 500)

  // Grant +2 tactic to each player and reset flags
  for (const player of players ?? []) {
    const tokens = player.command_tokens as { tactic_total: number; fleet: number; strategy: number }
    const { error: playerUpdateError } = await db
      .from('game_players')
      .update({
        command_tokens: { ...tokens, tactic_total: tokens.tactic_total + 2 },
        tokens_redistributed: false,
        passed: false,
      })
      .eq('id', player.id)
    if (playerUpdateError) return errorResponse(`Failed to update player: ${playerUpdateError.message}`, 500)
  }

  // Advance round and phase
  const { error: gameUpdateError } = await db
    .from('games')
    .update({ round: game.round + 1, phase: 'strategy' })
    .eq('id', body.game_id)
  if (gameUpdateError) return errorResponse(`Failed to advance game: ${gameUpdateError.message}`, 500)

  return okResponse({ advanced: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-status-phase.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-status-phase/index.ts tests/functions/game-status-phase.test.js
git commit -m "feat: add game-status-phase edge function"
```

---

## Task 6: game-update-command-tokens patch

**Files:**
- Create: `ti4-companion-web/tests/functions/game-update-command-tokens.phase6.test.js`
- Modify: `supabase/functions/game-update-command-tokens/index.ts`

This file currently uses `Deno.serve(async (req) => {...})` without exporting the handler. The test uses the `beforeAll` / `global.Deno` pattern from `game-start.test.js`.

- [ ] **Step 1: Write the failing test file**

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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-update-command-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ updateError = null } = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  })
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
            }),
          }),
        }),
        update: updateMock,
      }
    }
  })
  return { updateMock }
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-update-command-tokens/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-update-command-tokens Phase 6', () => {
  it('sets tokens_redistributed = true after updating tokens', async () => {
    const { updateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, tactic_total: 3, fleet: 3, strategy: 2 }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledOnce()
    expect(updateMock.mock.calls[0][0]).toMatchObject({ tokens_redistributed: true })
  })

  it('existing validation: rejects total > 16', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tactic_total: 10, fleet: 4, strategy: 4 }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/functions/game-update-command-tokens.phase6.test.js
```

Expected: the `tokens_redistributed` test fails (field not yet set).

- [ ] **Step 3: Modify `game-update-command-tokens/index.ts`**

Change the update call to include `tokens_redistributed: true`:

```typescript
  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { tactic_total: tactic, fleet, strategy }, tokens_redistributed: true })
    .eq('id', player.id)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-update-command-tokens.phase6.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-update-command-tokens/index.ts tests/functions/game-update-command-tokens.phase6.test.js
git commit -m "feat: set tokens_redistributed=true after command token update"
```

---

## Task 7: edgeFunctions.js wrappers

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.phase6.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { discardSecretObjective, scoreSecretObjective, statusPhase } from '../../src/lib/edgeFunctions.js'

describe('Phase 6 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('discardSecretObjective calls game-discard-secret-objective with game_id and objective_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { discarded: true }, error: null })
    await discardSecretObjective('g1', 'obj-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-discard-secret-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid' },
    })
  })

  it('scoreSecretObjective calls game-score-secret-objective with game_id and objective_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { scored: true }, error: null })
    await scoreSecretObjective('g1', 'obj-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-score-secret-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid' },
    })
  })

  it('statusPhase calls game-status-phase with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await statusPhase('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-status-phase', {
      body: { game_id: 'g1' },
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/lib/edgeFunctions.phase6.test.js
```

- [ ] **Step 3: Add the three exports to `src/lib/edgeFunctions.js`**

Add after `unlockCommander`:
```js
export const discardSecretObjective = (gameId, objectiveId) =>
  callFunction('game-discard-secret-objective', { game_id: gameId, objective_id: objectiveId })

export const scoreSecretObjective = (gameId, objectiveId) =>
  callFunction('game-score-secret-objective', { game_id: gameId, objective_id: objectiveId })

export const statusPhase = (gameId) =>
  callFunction('game-status-phase', { game_id: gameId })
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase6.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.phase6.test.js
git commit -m "feat: add phase6 edge function wrappers"
```

---

## Task 8: useGame hook updates

**Files:**
- Modify: `ti4-companion-web/src/hooks/useGame.js`
- Create: `ti4-companion-web/tests/hooks/useGame.phase6.test.js`

Adds `mySecrets` state, a Realtime subscription for `game_player_secret_objectives`, and three wrappers.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/game/ABC123' }),
}))

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
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
  updateGameSettings: vi.fn(),
  pickFactionColor: vi.fn(),
  setSpeaker: vi.fn(),
  startGame: vi.fn(),
  endTurn: vi.fn(),
  passAction: vi.fn(),
  advancePhase: vi.fn(),
  scoreObjective: vi.fn(),
  revealObjective: vi.fn(),
  shuffleDeck: vi.fn(),
  updateCommandTokens: vi.fn(),
  drawActionCard: vi.fn(),
  discardActionCard: vi.fn(),
  researchTechnology: vi.fn(),
  discardSecretObjective: vi.fn(),
  scoreSecretObjective: vi.fn(),
  statusPhase: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { discardSecretObjective, scoreSecretObjective, statusPhase } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
  status: 'active', phase: 'status', round: 2, vp_goal: 10,
  speaker_player_id: 'p1', active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: true, vp: 5, action_card_count: 2, secrets_selected: true, tokens_redistributed: false },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob',   strategy_card: 3, passed: true, vp: 3, action_card_count: 0, secrets_selected: false, tokens_redistributed: true },
]
const MY_SECRETS = [
  { id: 's1', state: 'held', player_id: 'p1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex' } },
]

function mockSupabase({ mySecrets = MY_SECRETS } = {}) {
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
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }),
        }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mySecrets, error: null }),
          }),
        }),
      }
    }
  })
}

describe('useGame Phase 6 — secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('loads mySecrets for the current player on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.mySecrets).toHaveLength(1)
    expect(result.current.mySecrets[0].id).toBe('s1')
  })

  it('discardTheSecret calls discardSecretObjective with game id and objective id', async () => {
    discardSecretObjective.mockResolvedValue({ discarded: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.discardTheSecret('s1'))
    expect(discardSecretObjective).toHaveBeenCalledWith('game-uuid', 's1')
  })

  it('scoreTheSecret calls scoreSecretObjective with game id and objective id', async () => {
    scoreSecretObjective.mockResolvedValue({ scored: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.scoreTheSecret('s1'))
    expect(scoreSecretObjective).toHaveBeenCalledWith('game-uuid', 's1')
  })

  it('endStatusPhase calls statusPhase with the game id', async () => {
    statusPhase.mockResolvedValue({ advanced: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.endStatusPhase())
    expect(statusPhase).toHaveBeenCalledWith('game-uuid')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/hooks/useGame.phase6.test.js
```

- [ ] **Step 3: Modify `src/hooks/useGame.js`**

**Add imports** at the top of the imports block:
```js
import {
  ...existing imports...,
  discardSecretObjective, scoreSecretObjective, statusPhase,
} from '../lib/edgeFunctions.js'
```

**Add `mySecrets` state** after `myCards`:
```js
const [mySecrets, setMySecrets] = useState([])
```

**Add secrets fetch** inside the `if (isGameScreen)` block, after the `myCards` fetch:
```js
        if (myPlayer) {
          // ... existing myCards fetch ...

          const { data: secrets } = await supabase
            .from('game_player_secret_objectives')
            .select('*, secret_objectives(name, timing, condition)')
            .eq('game_id', gameData.id)
            .eq('player_id', myPlayer.id)
            .eq('state', 'held')
          if (!mounted) return
          mySecretsData = secrets ?? []
        }
```

Also declare `mySecretsData` before the if block:
```js
      let mySecretsData = []
```

And set it after the other state:
```js
      setMySecrets(mySecretsData)
```

**Add Realtime subscription** inside the `if (isGameScreen)` channel block, after the action card deck subscription:
```js
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_player_secret_objectives', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_player_secret_objectives')
                .select('*, secret_objectives(name, timing, condition)')
                .eq('game_id', gameData.id)
                .eq('player_id', myPlayer.id)
                .eq('state', 'held')
              if (mounted && data) setMySecrets(data)
            }
          )
```

**Add to return object:**
```js
    mySecrets,
    ...
    // Phase 6 wrappers
    discardTheSecret: (objectiveId) => game ? discardSecretObjective(game.id, objectiveId) : Promise.reject(new Error('Game not loaded')),
    scoreTheSecret: (objectiveId) => game ? scoreSecretObjective(game.id, objectiveId) : Promise.reject(new Error('Game not loaded')),
    endStatusPhase: () => game ? statusPhase(game.id) : Promise.reject(new Error('Game not loaded')),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/hooks/useGame.phase6.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGame.js tests/hooks/useGame.phase6.test.js
git commit -m "feat: add phase6 secrets state and wrappers to useGame"
```

---

## Task 9: SecretObjectiveSelectionScreen

**Files:**
- Create: `ti4-companion-web/src/components/game/SecretObjectiveSelectionScreen.jsx`
- Create: `ti4-companion-web/tests/components/game/SecretObjectiveSelectionScreen.test.jsx`

Full-screen blocking gate. Shows both held secret objective cards. Player clicks Discard on one. No close button.

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SecretObjectiveSelectionScreen from '../../../src/components/game/SecretObjectiveSelectionScreen.jsx'

const SECRETS = [
  { id: 's1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex at end of status phase' } },
  { id: 's2', secret_objectives: { name: 'Darken the Skies', timing: 'action', condition: 'Win a space combat in a system that contains another player\'s ships' } },
]

const PLAYERS = [
  { id: 'p2', display_name: 'Bob', secrets_selected: false },
]

function renderScreen(overrides = {}) {
  return render(
    <SecretObjectiveSelectionScreen
      secrets={SECRETS}
      pendingPlayers={[]}
      onDiscard={vi.fn()}
      {...overrides}
    />
  )
}

describe('SecretObjectiveSelectionScreen', () => {
  it('shows both secret objective names', () => {
    renderScreen()
    expect(screen.getByText('Become the Gatekeeper')).toBeInTheDocument()
    expect(screen.getByText('Darken the Skies')).toBeInTheDocument()
  })

  it('shows timing for each objective', () => {
    renderScreen()
    expect(screen.getByText(/status/i)).toBeInTheDocument()
    expect(screen.getByText(/action/i)).toBeInTheDocument()
  })

  it('shows condition for each objective', () => {
    renderScreen()
    expect(screen.getByText(/control mecatol rex/i)).toBeInTheDocument()
  })

  it('renders a Discard button for each secret', () => {
    renderScreen()
    const discardBtns = screen.getAllByRole('button', { name: /discard/i })
    expect(discardBtns).toHaveLength(2)
  })

  it('calls onDiscard with objective id when Discard is clicked', () => {
    const onDiscard = vi.fn()
    renderScreen({ onDiscard })
    const btns = screen.getAllByRole('button', { name: /discard/i })
    fireEvent.click(btns[0])
    expect(onDiscard).toHaveBeenCalledWith('s1')
  })

  it('shows pending players banner when others have not selected', () => {
    renderScreen({ pendingPlayers: [{ id: 'p2', display_name: 'Bob' }] })
    expect(screen.getByText(/bob/i)).toBeInTheDocument()
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })

  it('does not show pending banner when list is empty', () => {
    renderScreen({ pendingPlayers: [] })
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/components/game/SecretObjectiveSelectionScreen.test.jsx
```

- [ ] **Step 3: Implement `SecretObjectiveSelectionScreen.jsx`**

```jsx
export default function SecretObjectiveSelectionScreen({ secrets, pendingPlayers = [], onDiscard }) {
  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center px-4 py-8 gap-6">
      <h2 className="font-display text-bright text-lg tracking-widest">SELECT YOUR SECRET OBJECTIVE</h2>
      <p className="text-dim text-sm font-body">Discard one card. The other is yours to score.</p>

      <div className="flex flex-col gap-4 w-full max-w-md">
        {secrets.map(s => {
          const ref = s.secret_objectives
          return (
            <div key={s.id} className="panel flex flex-col gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-bright text-sm font-body">{ref?.name}</span>
                  <span className="label text-xs text-gold">{ref?.timing?.toUpperCase()}</span>
                  <span className="text-dim text-xs font-body">{ref?.condition}</span>
                </div>
                <button
                  className="btn-ghost text-xs flex-shrink-0"
                  onClick={() => onDiscard(s.id)}
                >
                  DISCARD
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {pendingPlayers.length > 0 && (
        <div className="panel-inset w-full max-w-md">
          <p className="label text-xs text-dim mb-1">WAITING FOR OTHERS TO SELECT</p>
          <p className="text-muted text-sm font-body">
            {pendingPlayers.map(p => p.display_name).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/SecretObjectiveSelectionScreen.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SecretObjectiveSelectionScreen.jsx tests/components/game/SecretObjectiveSelectionScreen.test.jsx
git commit -m "feat: add SecretObjectiveSelectionScreen component"
```

---

## Task 10: SecretObjectivesModal

**Files:**
- Create: `ti4-companion-web/src/components/game/SecretObjectivesModal.jsx`
- Create: `ti4-companion-web/tests/components/game/SecretObjectivesModal.test.jsx`

Private hand view. Score button active only when `game.phase === 'status'` AND `secret_objectives.timing === game.phase`.

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SecretObjectivesModal from '../../../src/components/game/SecretObjectivesModal.jsx'

const SECRETS = [
  { id: 's1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex' } },
  { id: 's2', secret_objectives: { name: 'Darken the Skies', timing: 'action', condition: 'Win a space combat' } },
]

function renderModal(gamePhase = 'status', overrides = {}) {
  return render(
    <SecretObjectivesModal
      secrets={SECRETS}
      game={{ phase: gamePhase }}
      onScore={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  )
}

describe('SecretObjectivesModal', () => {
  it('shows all held secret objective names', () => {
    renderModal()
    expect(screen.getByText('Become the Gatekeeper')).toBeInTheDocument()
    expect(screen.getByText('Darken the Skies')).toBeInTheDocument()
  })

  it('shows timing and condition for each objective', () => {
    renderModal()
    expect(screen.getByText(/control mecatol rex/i)).toBeInTheDocument()
  })

  it('Score button is active for timing-matching objective during status phase', () => {
    renderModal('status')
    // s1 has timing 'status', game is 'status' — button should be enabled
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const enabledBtn = scoreBtns.find(b => !b.disabled)
    expect(enabledBtn).toBeTruthy()
  })

  it('Score button is disabled for non-matching timing', () => {
    renderModal('status')
    // s2 has timing 'action', game is 'status' — button should be disabled
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const disabledBtn = scoreBtns.find(b => b.disabled)
    expect(disabledBtn).toBeTruthy()
  })

  it('all Score buttons disabled outside status phase', () => {
    renderModal('action')
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    scoreBtns.forEach(b => expect(b).toBeDisabled())
  })

  it('calls onScore with objective id when Score is clicked', () => {
    const onScore = vi.fn()
    renderModal('status', { onScore })
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const enabledBtn = scoreBtns.find(b => !b.disabled)
    fireEvent.click(enabledBtn)
    expect(onScore).toHaveBeenCalledWith('s1')
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn()
    renderModal('status', { onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/components/game/SecretObjectivesModal.test.jsx
```

- [ ] **Step 3: Implement `SecretObjectivesModal.jsx`**

```jsx
export default function SecretObjectivesModal({ secrets, game, onScore, onClose }) {
  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">MY SECRET OBJECTIVES</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {secrets.length === 0 ? (
          <p className="text-dim text-sm font-body">No secret objectives held.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {secrets.map(s => {
              const ref = s.secret_objectives
              const canScore = game?.phase === 'status' && ref?.timing === game?.phase
              return (
                <div key={s.id} className="panel-inset flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-bright text-sm font-body">{ref?.name}</span>
                    <span className="label text-xs text-gold">{ref?.timing?.toUpperCase()}</span>
                    <span className="text-dim text-xs font-body">{ref?.condition}</span>
                  </div>
                  <button
                    className={canScore ? 'btn-primary text-xs flex-shrink-0' : 'btn-ghost text-xs flex-shrink-0 opacity-40'}
                    disabled={!canScore}
                    onClick={() => canScore && onScore(s.id)}
                  >
                    SCORE
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/SecretObjectivesModal.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SecretObjectivesModal.jsx tests/components/game/SecretObjectivesModal.test.jsx
git commit -m "feat: add SecretObjectivesModal component"
```

---

## Task 11: TokenRedistributionModal

**Files:**
- Create: `ti4-companion-web/src/components/game/TokenRedistributionModal.jsx`
- Create: `ti4-companion-web/tests/components/game/TokenRedistributionModal.test.jsx`

Blocking overlay shown when `tokens_redistributed === false`. +/− controls constrained so `tactic + fleet + strategy` always equals the current total. Submit calls `onSubmit`.

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TokenRedistributionModal from '../../../src/components/game/TokenRedistributionModal.jsx'

const PLAYER = {
  id: 'p1',
  display_name: 'Alice',
  command_tokens: { tactic_total: 4, fleet: 3, strategy: 2 }, // total = 9
}

function renderModal(overrides = {}) {
  return render(
    <TokenRedistributionModal
      player={PLAYER}
      onSubmit={vi.fn()}
      {...overrides}
    />
  )
}

describe('TokenRedistributionModal', () => {
  it('shows current token values', () => {
    renderModal()
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('4')
    expect(screen.getByLabelText(/fleet tokens/i)).toHaveValue('3')
    expect(screen.getByLabelText(/strategy tokens/i)).toHaveValue('2')
  })

  it('shows the total token count', () => {
    renderModal()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('increment button increases tactic count', () => {
    renderModal()
    const incBtn = screen.getAllByText('+')[0] // first + is tactic
    fireEvent.click(incBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('5')
  })

  it('decrement on one field constrains: must stay >= 0', () => {
    renderModal()
    // decrement tactic 4 times to 0
    const decBtn = screen.getAllByText('−')[0]
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('0')
    // clicking again should not go negative
    fireEvent.click(decBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('0')
  })

  it('calls onSubmit with new token split on confirm', () => {
    const onSubmit = vi.fn()
    renderModal({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onSubmit).toHaveBeenCalledWith({ tactic_total: 4, fleet: 3, strategy: 2 })
  })

  it('renders as a blocking overlay (fixed positioning class)', () => {
    const { container } = renderModal()
    expect(container.firstChild).toHaveClass('fixed')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/components/game/TokenRedistributionModal.test.jsx
```

- [ ] **Step 3: Implement `TokenRedistributionModal.jsx`**

```jsx
import { useState } from 'react'

export default function TokenRedistributionModal({ player, onSubmit }) {
  const base = player?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
  const [tokens, setTokens] = useState({ ...base })

  const total = base.tactic_total + base.fleet + base.strategy

  function adjust(key, delta) {
    setTokens(prev => {
      const next = { ...prev, [key]: prev[key] + delta }
      if (next[key] < 0) return prev
      return next
    })
  }

  const fields = [
    { key: 'tactic_total', label: 'TACTIC' },
    { key: 'fleet',        label: 'FLEET' },
    { key: 'strategy',     label: 'STRATEGY' },
  ]

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label">REDISTRIBUTE COMMAND TOKENS</p>
        <p className="text-dim text-xs font-body">
          Assign your {total} tokens across tactic, fleet, and strategy.
        </p>

        <div className="flex gap-4 justify-center">
          {fields.map(({ key, label }) => (
            <div key={key} className="text-center flex flex-col gap-1">
              <p className="label text-xs">{label}</p>
              <div className="flex items-center gap-1">
                <button className="counter-btn" onClick={() => adjust(key, -1)}>−</button>
                <input
                  type="text"
                  readOnly
                  value={tokens[key]}
                  aria-label={`${label.toLowerCase()} tokens`}
                  className="font-display text-bright text-lg w-6 text-center bg-transparent border-none outline-none"
                />
                <button className="counter-btn" onClick={() => adjust(key, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-dim text-xs">
            Total: <span className="text-bright font-display">{tokens.tactic_total + tokens.fleet + tokens.strategy}</span>
            {' '}/ {total}
          </span>
          <button
            className="btn-primary text-xs"
            onClick={() => onSubmit(tokens)}
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/TokenRedistributionModal.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/TokenRedistributionModal.jsx tests/components/game/TokenRedistributionModal.test.jsx
git commit -m "feat: add TokenRedistributionModal component"
```

---

## Task 12: ObjectivesSection — score buttons during status phase

**Files:**
- Modify: `ti4-companion-web/src/components/game/ObjectivesSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx`

Add `game`, `currentPlayerId`, and `onScore` props. Show a "SCORE" button next to each revealed objective during `phase === 'status'`, gated on not already scored by `currentPlayerId`.

- [ ] **Step 1: Add failing tests to `ObjectivesSection.test.jsx`**

Add at the end of the existing `describe` block:
```jsx
  it('shows Score button for unscored objectives during status phase', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p2"
        onScore={vi.fn()}
      />
    )
    // p2 has not scored 'Control 6 Planets'; should see a score button
    expect(screen.getByRole('button', { name: /score/i })).toBeInTheDocument()
  })

  it('does not show Score button for already-scored objectives', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
      />
    )
    // p1 already scored 'Spend 8 Resources' (scored_by includes p1)
    // There are 2 revealed objectives; p1 hasn't scored the second
    // So one score button visible (for Control 6 Planets)
    const scoreBtns = screen.queryAllByRole('button', { name: /score/i })
    // Spend 8 Resources has no score button for p1; Control 6 Planets does
    expect(scoreBtns).toHaveLength(1)
  })

  it('does not show Score buttons outside status phase', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'action' }}
        currentPlayerId="p2"
        onScore={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /score/i })).not.toBeInTheDocument()
  })

  it('calls onScore with objective id when Score button clicked', () => {
    const onScore = vi.fn()
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p2"
        onScore={onScore}
      />
    )
    fireEvent.click(screen.getAllByRole('button', { name: /score/i })[0])
    expect(onScore).toHaveBeenCalledWith(expect.any(String))
  })
```

Also add `import { fireEvent } from '@testing-library/react'` if not already present at the top of the test file.

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npx vitest run tests/components/game/ObjectivesSection.test.jsx
```

- [ ] **Step 3: Update `ObjectivesSection.jsx`**

```jsx
export default function ObjectivesSection({ objectives, players, game, currentPlayerId, onScore }) {
  const revealed = objectives.filter(o => o.state === 'revealed')
  const isStatusPhase = game?.phase === 'status'

  return (
    <div>
      <p className="label mb-2">PUBLIC OBJECTIVES</p>
      {revealed.length === 0 ? (
        <p className="text-dim text-sm">No objectives revealed yet.</p>
      ) : (
        <div className="panel-inset flex flex-col gap-3">
          {revealed.map(obj => {
            const ref = obj.public_objectives
            const scorers = (obj.scored_by ?? [])
              .map(pid => players.find(p => p.id === pid)?.display_name)
              .filter(Boolean)
            const alreadyScored = (obj.scored_by ?? []).includes(currentPlayerId)
            const showScore = isStatusPhase && !alreadyScored && onScore

            return (
              <div key={obj.id} className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-text text-sm">{ref?.name}</span>
                  <span className="text-dim text-xs ml-2">
                    Stage {ref?.stage} · {ref?.points ?? 1} VP
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-success">
                    {scorers.length > 0 ? scorers.join(', ') : <span className="text-dim">—</span>}
                  </div>
                  {showScore && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => onScore(obj.id)}
                    >
                      SCORE
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/ObjectivesSection.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ObjectivesSection.jsx tests/components/game/ObjectivesSection.test.jsx
git commit -m "feat: add score buttons to ObjectivesSection during status phase"
```

---

## Task 13: HostControlsSection — End Status Phase button

**Files:**
- Modify: `ti4-companion-web/src/components/game/HostControlsSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/HostControlsSection.test.jsx`

During `phase === 'status'`, show "END STATUS PHASE" button instead of "ADVANCE PHASE". Also show banners for players who haven't selected secrets or redistributed tokens.

- [ ] **Step 1: Add failing tests to `HostControlsSection.test.jsx`**

```jsx
  it('shows End Status Phase button during status phase', () => {
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={vi.fn()}
        pendingSecretPlayers={[]}
        pendingTokenPlayers={[]}
      />
    )
    expect(screen.getByRole('button', { name: /end status phase/i })).toBeInTheDocument()
  })

  it('shows pending secret selection banner', () => {
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={vi.fn()}
        pendingSecretPlayers={[{ id: 'p2', display_name: 'Bob' }]}
        pendingTokenPlayers={[]}
      />
    )
    expect(screen.getByText(/bob/i)).toBeInTheDocument()
    expect(screen.getByText(/secret/i)).toBeInTheDocument()
  })

  it('calls onEndStatusPhase when End Status Phase is clicked', () => {
    const onEndStatusPhase = vi.fn()
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={onEndStatusPhase}
        pendingSecretPlayers={[]}
        pendingTokenPlayers={[]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /end status phase/i }))
    expect(onEndStatusPhase).toHaveBeenCalledOnce()
  })
```

Add `import { fireEvent } from '@testing-library/react'` at top if not present.

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx
```

- [ ] **Step 3: Update `HostControlsSection.jsx`**

```jsx
import { useState } from 'react'

const PHASE_LABELS = { strategy: 'Action', action: 'Status', status: 'Strategy' }

export default function HostControlsSection({
  isHost, game, players, objectives,
  onScoreObjective, onRevealObjective, onShuffleDeck, onAdvancePhase,
  onEndStatusPhase,
  pendingSecretPlayers = [],
  pendingTokenPlayers = [],
}) {
  const [scoringObj, setScoringObj] = useState(null)
  const [scoringPlayer, setScoringPlayer] = useState('')
  const [revealStage, setRevealStage] = useState(1)

  if (!isHost) return null

  const isStatusPhase = game?.phase === 'status'
  const revealedObjs = objectives.filter(o => o.state === 'revealed')
  const nextPhaseLabel = PHASE_LABELS[game?.phase] ?? '?'

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">HOST CONTROLS</p>

      {/* Score Objective */}
      <div className="flex flex-col gap-2">
        <p className="text-dim text-xs">SCORE OBJECTIVE</p>
        <div className="flex gap-2 flex-wrap">
          <select
            className="input text-xs flex-1"
            value={scoringObj ?? ''}
            onChange={e => setScoringObj(e.target.value || null)}
          >
            <option value="">Select objective…</option>
            {revealedObjs.map(o => (
              <option key={o.id} value={o.id}>{o.public_objectives?.name}</option>
            ))}
          </select>
          <select
            className="input text-xs flex-1"
            value={scoringPlayer}
            onChange={e => setScoringPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <button
            className="btn-ghost text-xs"
            disabled={!scoringObj || !scoringPlayer}
            onClick={() => {
              onScoreObjective(scoringObj, scoringPlayer)
              setScoringObj(null)
              setScoringPlayer('')
            }}
          >
            SCORE
          </button>
        </div>
      </div>

      {/* Reveal & Shuffle */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="input text-xs"
          value={revealStage}
          onChange={e => setRevealStage(Number(e.target.value))}
          aria-label="objective stage"
        >
          <option value={1}>Stage 1</option>
          <option value={2}>Stage 2</option>
        </select>
        <button className="btn-ghost text-xs" onClick={() => onRevealObjective(revealStage)}>
          REVEAL OBJECTIVE
        </button>
        <button className="btn-ghost text-xs" onClick={() => onShuffleDeck(`public_objectives_${revealStage}`)}>
          SHUFFLE DECK
        </button>
      </div>

      {/* Pending banners (status phase) */}
      {isStatusPhase && pendingSecretPlayers.length > 0 && (
        <div className="panel-inset">
          <p className="label text-xs text-warning mb-1">WAITING: SECRET SELECTION</p>
          <p className="text-muted text-xs font-body">{pendingSecretPlayers.map(p => p.display_name).join(', ')}</p>
        </div>
      )}
      {isStatusPhase && pendingTokenPlayers.length > 0 && (
        <div className="panel-inset">
          <p className="label text-xs text-warning mb-1">WAITING: TOKEN REDISTRIBUTION</p>
          <p className="text-muted text-xs font-body">{pendingTokenPlayers.map(p => p.display_name).join(', ')}</p>
        </div>
      )}

      {/* Phase advance */}
      <div className="flex justify-end">
        {isStatusPhase ? (
          <button className="btn-primary" onClick={onEndStatusPhase}>
            END STATUS PHASE
          </button>
        ) : (
          <button className="btn-primary" onClick={onAdvancePhase}>
            ADVANCE PHASE → {nextPhaseLabel.toUpperCase()}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/HostControlsSection.jsx tests/components/game/HostControlsSection.test.jsx
git commit -m "feat: add End Status Phase button and pending banners to HostControlsSection"
```

---

## Task 14: MyPanelSection — Secrets button

**Files:**
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx`

Add a "SECRETS (N)" button that calls `onOpenSecrets`. The count is the number of held secrets passed in.

- [ ] **Step 1: Add failing tests to `MyPanelSection.test.jsx`**

```jsx
  it('shows Secrets button with count when secretCount is provided', () => {
    renderPanel({ secretCount: 2, onOpenSecrets: vi.fn() })
    expect(screen.getByRole('button', { name: /secrets \(2\)/i })).toBeInTheDocument()
  })

  it('calls onOpenSecrets when Secrets button is clicked', () => {
    const onOpenSecrets = vi.fn()
    renderPanel({ secretCount: 1, onOpenSecrets })
    fireEvent.click(screen.getByRole('button', { name: /secrets \(1\)/i }))
    expect(onOpenSecrets).toHaveBeenCalledOnce()
  })
```

Add `secretCount = 0` and `onOpenSecrets` to the `renderPanel` props defaults:
```jsx
function renderPanel(overrides = {}) {
  return render(
    <MyPanelSection
      ...existing props...
      secretCount={0}
      onOpenSecrets={vi.fn()}
      {...overrides}
    />
  )
}
```

Add `import { fireEvent } from '@testing-library/react'` if not present.

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

- [ ] **Step 3: Update `MyPanelSection.jsx`**

Add `secretCount = 0` and `onOpenSecrets` to the props destructuring:
```jsx
export default function MyPanelSection({
  ...existing props...,
  onOpenSecrets,
  secretCount = 0,
}) {
```

After the existing Action Cards button, add:
```jsx
      {/* Secret Objectives */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenSecrets}>
        SECRETS ({secretCount})
      </button>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/MyPanelSection.jsx tests/components/game/MyPanelSection.test.jsx
git commit -m "feat: add Secrets button to MyPanelSection"
```

---

## Task 15: ScoreboardSection — secret objective count badge

**Files:**
- Modify: `ti4-companion-web/src/components/game/ScoreboardSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx`

Add a `✦ N` badge for `secret_objective_count` (like the existing action card badge but for scored secrets). Other players see only the count, not card names.

- [ ] **Step 1: Add failing tests to `ScoreboardSection.test.jsx`**

Read the existing test file and add:
```jsx
  it('shows secret objective count badge for each player', () => {
    const players = [
      { id: 'p1', display_name: 'Alice', vp: 5, colour: 'green', passed: false, action_card_count: 2, secret_objective_count: 1 },
      { id: 'p2', display_name: 'Bob',   vp: 3, colour: 'red',   passed: false, action_card_count: 0, secret_objective_count: 0 },
    ]
    render(<ScoreboardSection players={players} game={{ phase: 'action' }} currentPlayerId="p1" onViewTech={vi.fn()} />)
    expect(screen.getByLabelText(/alice secret objectives: 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bob secret objectives: 0/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to confirm new one fails**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

- [ ] **Step 3: Update `ScoreboardSection.jsx`**

After the existing `✦ {player.action_card_count ?? 0}` span, add:
```jsx
              <span
                className="label text-xs text-muted"
                aria-label={`${player.display_name} secret objectives: ${player.secret_objective_count ?? 0}`}
              >
                ★ {player.secret_objective_count ?? 0}
              </span>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ScoreboardSection.jsx tests/components/game/ScoreboardSection.test.jsx
git commit -m "feat: add secret objective count badge to ScoreboardSection"
```

---

## Task 16: GameScreen wiring

**Files:**
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`

Wire up all phase 6 additions: blocking gates (SecretObjectiveSelectionScreen, TokenRedistributionModal), SecretObjectivesModal, updated ObjectivesSection and HostControlsSection props. No new tests needed — component tests cover each piece individually.

- [ ] **Step 1: Update imports in `GameScreen.jsx`**

Add to the import block:
```jsx
import SecretObjectiveSelectionScreen from './SecretObjectiveSelectionScreen.jsx'
import SecretObjectivesModal from './SecretObjectivesModal.jsx'
import TokenRedistributionModal from './TokenRedistributionModal.jsx'
```

- [ ] **Step 2: Add destructured values from `useGame`**

Add to the destructuring:
```jsx
    mySecrets, discardTheSecret, scoreTheSecret, endStatusPhase,
```

- [ ] **Step 3: Add modal state**

After the existing `const [activatingAbility, setActivatingAbility] = useState(null)` line:
```jsx
  const [secretsModalOpen, setSecretsModalOpen] = useState(false)
```

- [ ] **Step 4: Add blocking gate for secret selection**

After the `if (error) { ... }` block and before the main return, add:
```jsx
  // Blocking gate: secret objective selection
  if (currentPlayer && !currentPlayer.secrets_selected) {
    const pendingPlayers = players.filter(p => !p.secrets_selected && p.id !== currentPlayer.id)
    return (
      <SecretObjectiveSelectionScreen
        secrets={mySecrets}
        pendingPlayers={pendingPlayers}
        onDiscard={discardTheSecret}
      />
    )
  }
```

- [ ] **Step 5: Update ObjectivesSection to pass new props**

Change:
```jsx
        <ObjectivesSection objectives={objectives} players={players} />
```
To:
```jsx
        <ObjectivesSection
          objectives={objectives}
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
          onScore={(objId) => scoreAnObjective(objId, currentPlayer?.id)}
        />
```

- [ ] **Step 6: Update HostControlsSection to pass new props**

Change the `<HostControlsSection ... />` call to include:
```jsx
          onEndStatusPhase={endStatusPhase}
          pendingSecretPlayers={players.filter(p => !p.secrets_selected)}
          pendingTokenPlayers={players.filter(p => !p.tokens_redistributed)}
```

- [ ] **Step 7: Update MyPanelSection to pass new props**

Add to `<MyPanelSection ... />`:
```jsx
          onOpenSecrets={() => setSecretsModalOpen(true)}
          secretCount={mySecrets.length}
```

- [ ] **Step 8: Add SecretObjectivesModal and TokenRedistributionModal to JSX**

After the existing `{activatingAbility && ...}` block, add:
```jsx
      {secretsModalOpen && (
        <SecretObjectivesModal
          secrets={mySecrets}
          game={game}
          onScore={(objId) => { scoreTheSecret(objId); setSecretsModalOpen(false) }}
          onClose={() => setSecretsModalOpen(false)}
        />
      )}

      {currentPlayer && currentPlayer.tokens_redistributed === false && (
        <TokenRedistributionModal
          player={currentPlayer}
          onSubmit={updateTokens}
        />
      )}
```

- [ ] **Step 9: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests pass plus all new phase 6 tests.

- [ ] **Step 10: Commit**

```bash
git add src/components/game/GameScreen.jsx
git commit -m "feat: wire phase6 components into GameScreen"
```

---

## Task 17: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd ti4-companion-web && npx vitest run
```

Expected: all tests pass, count higher than before phase 6 (was 394).

- [ ] **Step 2: Commit if any loose files remain**

```bash
git status
```

If clean, you're done. If there are unstaged changes, investigate before committing.

- [ ] **Step 3: Final commit tag**

```bash
git log --oneline -10
```

Confirm all phase 6 commits are present in sequence.
