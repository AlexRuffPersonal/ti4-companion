# Task 06: game-assign-hits Edge Function

**Files:**
- Create: `supabase/functions/game-assign-hits/index.ts`
- Create: `tests/functions/game-assign-hits.test.js`

**Context:** Called with a `casualties` array `[{ unit_type, player_unit_id, action: "destroy" | "sustain" }]`.

**Validation:**
- Caller must be the player currently assigning hits (defender assigns after attacker rolls; attacker assigns after defender rolls)
- `casualties.length` must equal the hit count for this step
- `sustain` only allowed for units with `sustain_damage = true` and `damaged = false`

**On application:**
- `destroy`: decrement `count`; delete row if count reaches 0
- `sustain`: set `damaged = true`

**End-of-round logic after `attacker_assign` step:**
1. If `retreat_declared_by` is set: move surviving ships to `retreat_destination`, insert `game_system_tokens` (retreat CC), mark `complete`
2. If either side has 0 ships in the system: set `winner_player_id`, mark `complete`
3. Otherwise: increment `round`, advance phase to `attacker_roll` (barrage only on round 1)

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-assign-hits.test.js`:

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
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-assign-hits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID, game_id: GAME_ID, system_key: '1,-1',
  attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID,
  phase: 'defender_assign', round: 1,
  attacker_hits: 2, defender_hits: 0,
  retreat_declared_by: null, retreat_destination: null,
}

const DEFENDER_UNITS = [
  { id: 'u1', player_id: DEFENDER_ID, unit_type: 'carrier', count: 2, damaged: false, system_key: '1,-1' },
  { id: 'u2', player_id: DEFENDER_ID, unit_type: 'dreadnought', count: 1, damaged: false, system_key: '1,-1' },
]
const UNIT_DEFS = [
  { name: 'carrier', sustain_damage: false },
  { name: 'dreadnought', sustain_damage: true },
]

const ATTACKER_UNITS = [
  { id: 'u3', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 1, damaged: false, system_key: '1,-1' },
]

function mockDb({
  player = { id: DEFENDER_ID },
  combat = BASE_COMBAT,
  assigneeUnits = DEFENDER_UNITS,
  unitDefs = UNIT_DEFS,
  opposingUnits = ATTACKER_UNITS,
  updateCombatError = null,
  updateUnitError = null,
} = {}) {
  const combatUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateCombatError }) })
  const unitUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateUnitError }) })
  const unitDeleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const tokenInsertMock = vi.fn().mockResolvedValue({ error: null })
  const unitInsertMock = vi.fn().mockResolvedValue({ error: null })

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
    if (table === 'game_player_units') {
      let call = 0
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockImplementation(() => {
                call++
                return Promise.resolve({ data: call === 1 ? assigneeUnits : opposingUnits, error: null })
              }),
            }),
          }),
        }),
        update: unitUpdateMock,
        delete: unitDeleteMock,
        insert: unitInsertMock,
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    if (table === 'game_system_tokens') {
      return { insert: tokenInsertMock }
    }
  })
  return { combatUpdateMock, unitUpdateMock, unitDeleteMock, tokenInsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-assign-hits', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: [] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when casualties is not an array', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, casualties: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when casualties count does not match hit count', async () => {
    mockDb()
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'carrier', player_unit_id: 'u1', action: 'destroy' }], // only 1, but attacker_hits=2
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/must assign.*hits/i)
  })

  it('returns 409 when sustain used on non-sustain unit', async () => {
    mockDb()
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [
        { unit_type: 'carrier', player_unit_id: 'u1', action: 'sustain' },
        { unit_type: 'carrier', player_unit_id: 'u1', action: 'destroy' },
      ],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/cannot sustain/i)
  })

  it('returns 409 when sustain used on already-damaged unit', async () => {
    mockDb({
      assigneeUnits: [
        { id: 'u2', player_id: DEFENDER_ID, unit_type: 'dreadnought', count: 1, damaged: true, system_key: '1,-1' },
        { id: 'u1', player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, damaged: false, system_key: '1,-1' },
      ],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [
        { unit_type: 'dreadnought', player_unit_id: 'u2', action: 'sustain' },
        { unit_type: 'carrier', player_unit_id: 'u1', action: 'destroy' },
      ],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already damaged/i)
  })

  it('applies destroy by decrementing count', async () => {
    const { unitUpdateMock } = mockDb()
    await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [
        { unit_type: 'carrier', player_unit_id: 'u1', action: 'destroy' },
        { unit_type: 'carrier', player_unit_id: 'u1', action: 'destroy' },
      ],
    }))
    expect(unitUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ count: expect.any(Number) }))
  })

  it('applies sustain by setting damaged=true', async () => {
    mockDb({ combat: { ...BASE_COMBAT, attacker_hits: 1 } })
    const { unitUpdateMock } = mockDb({ combat: { ...BASE_COMBAT, attacker_hits: 1 } })
    await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [
        { unit_type: 'dreadnought', player_unit_id: 'u2', action: 'sustain' },
      ],
    }))
    expect(unitUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ damaged: true }))
  })

  it('advances to attacker_roll on next round after attacker_assign with survivors', async () => {
    const { combatUpdateMock } = mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT, phase: 'attacker_assign', round: 1,
        defender_hits: 1, attacker_hits: 0,
        retreat_declared_by: null,
      },
      assigneeUnits: [
        { id: 'u3', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' },
      ],
      opposingUnits: [
        { id: 'u1', player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, damaged: false, system_key: '1,-1' },
      ],
    })
    await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u3', action: 'destroy' }],
    }))
    const updateArg = combatUpdateMock.mock.calls[0][0]
    expect(updateArg.phase).toBe('attacker_roll')
    expect(updateArg.round).toBe(2)
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-assign-hits.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-assign-hits/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type Casualty = { unit_type: string; player_unit_id: string; action: 'destroy' | 'sustain' }
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; damaged: boolean; system_key: string }
type UnitDef = { name: string; sustain_damage: boolean }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; casualties?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!Array.isArray(body.casualties)) return errorResponse("'casualties' must be an array")

  const casualties = body.casualties as Casualty[]

  const { data: player } = await db
    .from('game_players').select('id')
    .eq('game_id', body.game_id).eq('user_id', userId).maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats').select('*')
    .eq('id', body.combat_id).eq('game_id', body.game_id).maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  const assignPhases = ['defender_assign', 'attacker_assign']
  if (!assignPhases.includes(combat.phase)) return errorResponse('Combat is not in an assign phase', 409)

  // Determine who is assigning hits and how many hits to assign
  const isDefenderAssign = combat.phase === 'defender_assign'
  const assigneeId = isDefenderAssign ? combat.defender_player_id : combat.attacker_player_id
  const hitsToAssign = isDefenderAssign ? combat.attacker_hits : combat.defender_hits

  if (player.id !== assigneeId) return errorResponse('Not your turn to assign hits', 409)
  if (casualties.length !== hitsToAssign) {
    return errorResponse(`Must assign exactly ${hitsToAssign} hits`, 409)
  }

  // Fetch assignee units with sustain info
  const { data: assigneeUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, damaged, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', assigneeId)
    .is('on_planet', null)

  const unitMap = new Map((assigneeUnits ?? []).map((u: UnitRow) => [u.id, u]))

  const unitTypes = [...new Set(casualties.map((c) => c.unit_type))]
  const { data: unitDefs } = await db
    .from('units').select('name, sustain_damage')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])
  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))

  // Validate casualties
  for (const c of casualties) {
    if (c.action === 'sustain') {
      const def = defMap.get(c.unit_type)
      if (!def?.sustain_damage) return errorResponse(`Cannot sustain ${c.unit_type}: no Sustain Damage ability`, 409)
      const unit = unitMap.get(c.player_unit_id)
      if (unit?.damaged) return errorResponse(`Cannot sustain ${c.unit_type}: unit is already damaged`, 409)
    }
  }

  // Apply casualties
  const destroyCounts = new Map<string, number>()
  for (const c of casualties) {
    if (c.action === 'destroy') {
      destroyCounts.set(c.player_unit_id, (destroyCounts.get(c.player_unit_id) ?? 0) + 1)
    }
    if (c.action === 'sustain') {
      await db.from('game_player_units').update({ damaged: true }).eq('id', c.player_unit_id)
    }
  }

  for (const [unitId, removeCount] of destroyCounts.entries()) {
    const unit = unitMap.get(unitId)
    if (!unit) continue
    const newCount = unit.count - removeCount
    if (newCount <= 0) {
      await db.from('game_player_units').delete().eq('id', unitId)
    } else {
      await db.from('game_player_units').update({ count: newCount }).eq('id', unitId)
    }
  }

  // If this was defender_assign, advance to defender_roll
  if (isDefenderAssign) {
    await db.from('game_combats').update({ phase: 'defender_roll' }).eq('id', body.combat_id)
    return okResponse({ phase: 'defender_roll' })
  }

  // attacker_assign — check end-of-round conditions

  // Check for retreat
  if (combat.retreat_declared_by) {
    // Move retreating player's ships to retreat_destination
    const retreaterId = combat.retreat_declared_by
    await db
      .from('game_player_units')
      .update({ system_key: combat.retreat_destination })
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', retreaterId)
      .is('on_planet', null)

    // Insert retreat CC token
    await db.from('game_system_tokens').insert({
      game_id: body.game_id,
      system_key: combat.retreat_destination,
      player_id: retreaterId,
      token_type: 'retreat_cc',
    })

    const winnerId = retreaterId === combat.attacker_player_id
      ? combat.defender_player_id
      : combat.attacker_player_id

    await db.from('game_combats').update({
      status: 'complete',
      winner_player_id: winnerId,
    }).eq('id', body.combat_id)

    return okResponse({ status: 'complete', winner_player_id: winnerId })
  }

  // Check for 0 ships on either side
  const { data: atkUnitsLeft } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.attacker_player_id)
    .is('on_planet', null)

  const { data: defUnitsLeft } = await db
    .from('game_player_units')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', combat.defender_player_id)
    .is('on_planet', null)

  const atkAlive = (atkUnitsLeft ?? []).length
  const defAlive = (defUnitsLeft ?? []).length

  if (atkAlive === 0 || defAlive === 0) {
    const winnerId = atkAlive > 0 ? combat.attacker_player_id : combat.defender_player_id
    await db.from('game_combats').update({
      status: 'complete',
      winner_player_id: winnerId,
    }).eq('id', body.combat_id)
    return okResponse({ status: 'complete', winner_player_id: winnerId })
  }

  // Continue to next round
  const nextRound = combat.round + 1
  await db.from('game_combats').update({
    phase: 'attacker_roll',
    round: nextRound,
    attacker_dice: null,
    defender_dice: null,
    attacker_hits: 0,
    defender_hits: 0,
  }).eq('id', body.combat_id)

  return okResponse({ phase: 'attacker_roll', round: nextRound })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/functions/game-assign-hits.test.js
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-assign-hits/index.ts tests/functions/game-assign-hits.test.js
git commit -m "feat: add game-assign-hits edge function with sustain/destroy and end-of-round logic"
```
