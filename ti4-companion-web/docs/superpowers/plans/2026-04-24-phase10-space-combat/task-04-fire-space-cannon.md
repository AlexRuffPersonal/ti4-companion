# Task 04: game-fire-space-cannon Edge Function

**Files:**
- Create: `supabase/functions/game-fire-space-cannon/index.ts`
- Create: `tests/functions/game-fire-space-cannon.test.js`

**Context:** Called by each eligible player to fire or pass their Space Cannon opportunity. On fire: rolls dice server-side, applies hits to the target's fighters (then other ships) in the activated system, marks the player's `space_cannon_pending` entry `resolved: true`. When all entries are resolved, advances phase to `barrage` (if either side has destroyers) or `attacker_roll`.

Space Cannon targeting: if the firing player is the **attacker**, hits land on the defender. Everyone else hits the attacker.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-fire-space-cannon.test.js`:

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
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  attacker_player_id: PLAYER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'space_cannon',
  space_cannon_pending: [
    { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: false },
  ],
}

const DEFENDER_UNITS = [
  { id: 'u1', player_id: DEFENDER_ID, unit_type: 'carrier', count: 2, system_key: '1,-1' },
  { id: 'u2', player_id: DEFENDER_ID, unit_type: 'fighter', count: 4, system_key: '1,-1' },
]

function makeRequest(body) {
  return new Request('http://localhost/game-fire-space-cannon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID },
  combat = BASE_COMBAT,
  unitDef = { name: 'pds', space_cannon: '5(x3)' },
  targetUnits = DEFENDER_UNITS,
  destroyers = [],
  updateError = null,
} = {}) {
  const combatUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const unitUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const unitDeleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  db.from.mockImplementation((table) => {
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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
            }),
          }),
        }),
        update: combatUpdateMock,
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: unitDef, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      // First call: get target units; second call: check destroyers
      let callCount = 0
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockImplementation(() => {
                callCount++
                return Promise.resolve({ data: callCount === 1 ? targetUnits : destroyers, error: null })
              }),
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: destroyers, error: null }),
              }),
            }),
          }),
        }),
        update: unitUpdateMock,
        delete: unitDeleteMock,
      }
    }
  })
  return { combatUpdateMock, unitUpdateMock, unitDeleteMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-fire-space-cannon', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, pass: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when pass is not a boolean', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when combat phase is not space_cannon', async () => {
    mockDb({ combat: { ...BASE_COMBAT, phase: 'attacker_roll' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not in space_cannon phase/i)
  })

  it('returns 409 when player has no unresolved sc entry', async () => {
    mockDb({
      combat: {
        ...BASE_COMBAT,
        space_cannon_pending: [
          { player_id: PLAYER_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: true },
        ],
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no unresolved/i)
  })

  it('marks entry resolved on pass without rolling dice', async () => {
    const { combatUpdateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    expect(res.status).toBe(200)
    const updateArg = combatUpdateMock.mock.calls[0][0]
    expect(updateArg.space_cannon_pending[0].resolved).toBe(true)
  })

  it('advances to attacker_roll when all resolved and no destroyers', async () => {
    const { combatUpdateMock } = mockDb({ destroyers: [] })
    await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: true }))
    const updateArg = combatUpdateMock.mock.calls[0][0]
    expect(updateArg.phase).toBe('attacker_roll')
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-fire-space-cannon.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-fire-space-cannon/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }

function parseCombatValue(text: string): number {
  const m = text.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 6
}

async function applyHits(gameId: string, systemKey: string, targetPlayerId: string, hits: number): Promise<void> {
  if (hits <= 0) return
  const { data: units } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', targetPlayerId)
    .is('on_planet', null)

  const sorted = [...(units ?? []) as UnitRow[]].sort((a, b) => {
    // Fighters absorb hits first
    if (a.unit_type === 'fighter' && b.unit_type !== 'fighter') return -1
    if (a.unit_type !== 'fighter' && b.unit_type === 'fighter') return 1
    return 0
  })

  let remaining = hits
  for (const unit of sorted) {
    if (remaining <= 0) break
    const remove = Math.min(remaining, unit.count)
    if (unit.count - remove === 0) {
      await db.from('game_player_units').delete().eq('id', unit.id)
    } else {
      await db.from('game_player_units').update({ count: unit.count - remove }).eq('id', unit.id)
    }
    remaining -= remove
  }
}

async function hasDestroyer(gameId: string, systemKey: string, playerId: string): Promise<boolean> {
  const { data } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', playerId)
    .eq('unit_type', 'destroyer')
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; pass?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (typeof body.pass !== 'boolean') return errorResponse("'pass' must be a boolean")

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)
  if (combat.phase !== 'space_cannon') return errorResponse('Combat is not in space_cannon phase', 409)

  const pending = (combat.space_cannon_pending ?? []) as SpEntry[]
  const myEntry = pending.find((e) => e.player_id === player.id && !e.resolved)
  if (!myEntry) return errorResponse('No unresolved space cannon opportunity for this player', 409)

  if (!body.pass) {
    const { data: unitDef } = await db
      .from('units')
      .select('space_cannon')
      .eq('name', myEntry.unit_type)
      .maybeSingle()
    const scValue = parseCombatValue(unitDef?.space_cannon ?? '6')

    let hits = 0
    for (let i = 0; i < myEntry.dice_count; i++) {
      if (Math.ceil(Math.random() * 10) >= scValue) hits++
    }

    // Targeting: attacker fires at defender; everyone else fires at attacker
    const targetId = player.id === combat.attacker_player_id
      ? combat.defender_player_id
      : combat.attacker_player_id

    await applyHits(body.game_id, combat.system_key, targetId, hits)
  }

  const updatedPending = pending.map((e) =>
    e.player_id === player.id && !e.resolved ? { ...e, resolved: true } : e
  )

  const allResolved = updatedPending.every((e) => e.resolved)
  let newPhase = combat.phase as string
  if (allResolved) {
    const atkHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.attacker_player_id)
    const defHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.defender_player_id)
    newPhase = (atkHasDestroyer || defHasDestroyer) ? 'barrage' : 'attacker_roll'
  }

  const { error: updateError } = await db
    .from('game_combats')
    .update({ space_cannon_pending: updatedPending, phase: newPhase })
    .eq('id', body.combat_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ phase: newPhase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/functions/game-fire-space-cannon.test.js
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-fire-space-cannon/index.ts tests/functions/game-fire-space-cannon.test.js
git commit -m "feat: add game-fire-space-cannon edge function"
```
