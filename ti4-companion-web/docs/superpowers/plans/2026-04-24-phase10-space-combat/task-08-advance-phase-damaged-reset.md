# Task 08: Modify game-advance-phase — Reset damaged flag

**Files:**
- Modify: `supabase/functions/game-advance-phase/index.ts`
- Create: `tests/functions/game-advance-phase.phase10.test.js`

**Context:** When the game transitions into the **status phase** (i.e., `action → status`), bulk-reset `damaged = false` on all `game_player_units` rows for the game. One UPDATE with no extra function needed.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-advance-phase.phase10.test.js`:

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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
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

function mockDb({ game = { id: GAME_ID, host_user_id: HOST_ID, phase: 'action', round: 2, agenda_unlocked: false } } = {}) {
  const gamesUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const unitsUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const playersUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: gamesUpdateMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
        update: playersUpdateMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_units') {
      return { update: unitsUpdateMock }
    }
  })
  return { gamesUpdateMock, unitsUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-advance-phase — Phase 10 damaged reset', () => {
  it('resets damaged=false on all units when advancing action → status', async () => {
    const { unitsUpdateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(unitsUpdateMock).toHaveBeenCalledWith({ damaged: false })
  })

  it('does NOT reset damaged when advancing strategy → action', async () => {
    const { unitsUpdateMock } = mockDb({
      game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'strategy', round: 2, agenda_unlocked: false },
    })
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(unitsUpdateMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-advance-phase.phase10.test.js
```

Expected: FAIL — `unitsUpdateMock` not called / function doesn't reset `damaged`.

- [ ] **Step 3: Add damaged reset to `supabase/functions/game-advance-phase/index.ts`**

Find the block that handles `game.phase === 'action'` (the `action → status` transition). After the games `update` call and before the return, add:

```typescript
  // Reset Sustain Damage for all units in the game
  await db
    .from('game_player_units')
    .update({ damaged: false })
    .eq('game_id', body.game_id)
```

The surrounding context to locate the insertion point looks like:

```typescript
  } else if (game.phase === 'action') {
    // ... existing logic to compute next phase and update games ...
    const { error } = await db
      .from('games')
      .update({ phase: 'status', ... })
      .eq('id', body.game_id)
    if (error) return errorResponse(...)

    // ADD HERE:
    await db
      .from('game_player_units')
      .update({ damaged: false })
      .eq('game_id', body.game_id)

  } else if (game.phase === 'status') {
```

- [ ] **Step 4: Run both test files to verify they pass**

```bash
npx vitest run tests/functions/game-advance-phase.test.js tests/functions/game-advance-phase.phase10.test.js
```

Expected: all existing tests still pass + 2 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts tests/functions/game-advance-phase.phase10.test.js
git commit -m "feat: reset damaged flag on all units when entering status phase"
```
