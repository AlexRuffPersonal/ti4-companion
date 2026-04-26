# Task 05: game-roll-combat-dice Edge Function

**Files:**
- Create: `supabase/functions/game-roll-combat-dice/index.ts`
- Create: `tests/functions/game-roll-combat-dice.test.js`

**Context:** Handles three phases:
- `barrage` — both players' Destroyers fire AFB against the opponent's fighters simultaneously. Hits applied immediately. Phase advances to `attacker_roll`.
- `attacker_roll` — attacker rolls combat dice for their space units. Hits counted, stored in `attacker_dice` + `attacker_hits`. Phase advances to `defender_assign`.
- `defender_roll` — same for defender. Phase advances to `attacker_assign`.

The caller must be the appropriate player:
- `barrage`: either attacker or defender may trigger (server resolves both sides)
- `attacker_roll`: must be the attacker
- `defender_roll`: must be the defender

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-roll-combat-dice.test.js`:

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
import { handler } from '../../../supabase/functions/game-roll-combat-dice/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const ATK_UNITS = [
  { id: 'u1', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 2, system_key: '1,-1' },
]
const ATK_UNIT_DEF = { name: 'cruiser', combat: '7', afb: null, sustain_damage: false }

function mockDb({
  player = { id: ATTACKER_ID },
  combat = {
    id: COMBAT_ID, game_id: GAME_ID, system_key: '1,-1',
    attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID,
    phase: 'attacker_roll', round: 1,
  },
  playerUnits = ATK_UNITS,
  unitDefs = [ATK_UNIT_DEF],
  defUnits = [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'fighter', count: 3, system_key: '1,-1' }],
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
    if (table === 'game_player_units') {
      let callCount = 0
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockImplementation(() => {
                callCount++
                return Promise.resolve({ data: callCount <= 2 ? playerUnits : defUnits, error: null })
              }),
            }),
          }),
        }),
        update: unitUpdateMock,
        delete: unitDeleteMock,
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
  })
  return { combatUpdateMock, unitUpdateMock, unitDeleteMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-roll-combat-dice', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when phase is not a roll phase', async () => {
    mockDb({ combat: { id: COMBAT_ID, game_id: GAME_ID, system_key: '1,-1', attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID, phase: 'defender_assign', round: 1 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a roll phase/i)
  })

  it('returns 409 when caller is not the attacker during attacker_roll', async () => {
    mockDb({ player: { id: DEFENDER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not your roll/i)
  })

  it('stores dice results and advances to defender_assign on attacker_roll', async () => {
    const { combatUpdateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const updateArg = combatUpdateMock.mock.calls[0][0]
    expect(updateArg.phase).toBe('defender_assign')
    expect(Array.isArray(updateArg.attacker_dice)).toBe(true)
    expect(updateArg.attacker_dice.length).toBe(2) // 2 cruisers
    expect(typeof updateArg.attacker_hits).toBe('number')
  })

  it('stores dice results and advances to attacker_assign on defender_roll', async () => {
    const { combatUpdateMock } = mockDb({
      player: { id: DEFENDER_ID },
      combat: { id: COMBAT_ID, game_id: GAME_ID, system_key: '1,-1', attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID, phase: 'defender_roll', round: 1 },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const updateArg = combatUpdateMock.mock.calls[0][0]
    expect(updateArg.phase).toBe('attacker_assign')
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-roll-combat-dice.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-roll-combat-dice/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; combat: string | null; afb: string | null; sustain_damage: boolean }
type DieResult = { unit_type: string; roll: number; hit: boolean }

function parseStat(text: string): { value: number; dice: number } {
  const diceMatch = text.match(/\(x(\d+)\)/)
  const valueMatch = text.match(/^(\d+)/)
  return {
    value: valueMatch ? parseInt(valueMatch[1]) : 6,
    dice: diceMatch ? parseInt(diceMatch[1]) : 1,
  }
}

function rollDice(units: UnitRow[], defMap: Map<string, UnitDef>): { results: DieResult[]; hits: number } {
  const results: DieResult[] = []
  let hits = 0
  for (const unit of units) {
    const def = defMap.get(unit.unit_type)
    if (!def?.combat) continue
    const { value, dice } = parseStat(def.combat)
    const rollCount = dice * unit.count
    for (let i = 0; i < rollCount; i++) {
      const roll = Math.ceil(Math.random() * 10)
      const hit = roll >= value
      if (hit) hits++
      results.push({ unit_type: unit.unit_type, roll, hit })
    }
  }
  return { results, hits }
}

async function applyAfbHits(gameId: string, systemKey: string, targetId: string, hits: number): Promise<void> {
  if (hits <= 0) return
  const { data: fighters } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', targetId)
    .eq('unit_type', 'fighter')
    .is('on_planet', null)
  for (const f of fighters ?? []) {
    const remove = Math.min(hits, f.count)
    if (f.count - remove === 0) {
      await db.from('game_player_units').delete().eq('id', f.id)
    } else {
      await db.from('game_player_units').update({ count: f.count - remove }).eq('id', f.id)
    }
    hits -= remove
    if (hits <= 0) break
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")

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

  const rollPhases = ['barrage', 'attacker_roll', 'defender_roll']
  if (!rollPhases.includes(combat.phase)) {
    return errorResponse('Combat is not a roll phase', 409)
  }

  if (combat.phase === 'attacker_roll' && player.id !== combat.attacker_player_id) {
    return errorResponse('Not your roll — attacker must roll', 409)
  }
  if (combat.phase === 'defender_roll' && player.id !== combat.defender_player_id) {
    return errorResponse('Not your roll — defender must roll', 409)
  }

  // Barrage phase: both players' destroyers fire AFB simultaneously
  if (combat.phase === 'barrage') {
    const { data: atkDestroyers } = await db
      .from('game_player_units')
      .select('id, player_id, unit_type, count, system_key')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', combat.attacker_player_id)
      .eq('unit_type', 'destroyer')
      .is('on_planet', null)

    const { data: defDestroyers } = await db
      .from('game_player_units')
      .select('id, player_id, unit_type, count, system_key')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', combat.defender_player_id)
      .eq('unit_type', 'destroyer')
      .is('on_planet', null)

    const { data: defDef } = await db
      .from('units')
      .select('name, afb')
      .eq('name', 'destroyer')
      .maybeSingle()

    if (defDef?.afb) {
      const { value, dice } = parseStat(defDef.afb)

      let atkAfbHits = 0
      for (const d of atkDestroyers ?? []) {
        for (let i = 0; i < dice * d.count; i++) {
          if (Math.ceil(Math.random() * 10) >= value) atkAfbHits++
        }
      }
      let defAfbHits = 0
      for (const d of defDestroyers ?? []) {
        for (let i = 0; i < dice * d.count; i++) {
          if (Math.ceil(Math.random() * 10) >= value) defAfbHits++
        }
      }

      await applyAfbHits(body.game_id, combat.system_key, combat.defender_player_id, atkAfbHits)
      await applyAfbHits(body.game_id, combat.system_key, combat.attacker_player_id, defAfbHits)
    }

    await db.from('game_combats').update({ phase: 'attacker_roll' }).eq('id', body.combat_id)
    return okResponse({ phase: 'attacker_roll' })
  }

  // Main combat roll (attacker_roll or defender_roll)
  const rollingPlayerId = combat.phase === 'attacker_roll'
    ? combat.attacker_player_id
    : combat.defender_player_id

  const { data: rollerUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', combat.system_key)
    .eq('player_id', rollingPlayerId)
    .is('on_planet', null)

  const unitTypes = [...new Set((rollerUnits ?? []).map((u: UnitRow) => u.unit_type))]
  const { data: unitDefs } = await db
    .from('units')
    .select('name, combat, afb, sustain_damage')
    .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])

  const defMap = new Map((unitDefs ?? []).map((u: UnitDef) => [u.name, u]))
  const { results, hits } = rollDice(rollerUnits ?? [], defMap)

  const nextPhase = combat.phase === 'attacker_roll' ? 'defender_assign' : 'attacker_assign'
  const updatePayload = combat.phase === 'attacker_roll'
    ? { attacker_dice: results, attacker_hits: hits, phase: nextPhase }
    : { defender_dice: results, defender_hits: hits, phase: nextPhase }

  const { error } = await db.from('game_combats').update(updatePayload).eq('id', body.combat_id)
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  return okResponse({ phase: nextPhase, dice: results, hits })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/functions/game-roll-combat-dice.test.js
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-roll-combat-dice/index.ts tests/functions/game-roll-combat-dice.test.js
git commit -m "feat: add game-roll-combat-dice edge function (barrage + main roll)"
```
