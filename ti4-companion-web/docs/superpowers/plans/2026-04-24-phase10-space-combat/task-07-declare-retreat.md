# Task 07: game-declare-retreat Edge Function

**Files:**
- Create: `supabase/functions/game-declare-retreat/index.ts`
- Create: `tests/functions/game-declare-retreat.test.js`

**Context:** Either player may declare retreat before their roll phase. Validates:
1. `destination` is a key in `games.map_tiles`
2. `destination` is adjacent (axial neighbor) to the combat system, or wormhole-connected
3. Retreating player has at least one unit or controlled planet in that system
4. Retreating player has at least 1 CC available in reinforcements (command_tokens.strategy > 0 is used as proxy — in TI4 retreat places a CC from reinforcements)

On success: sets `retreat_declared_by` and `retreat_destination` on the combat row. The retreat executes when `game-assign-hits` processes the end of the round.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-declare-retreat.test.js`:

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
import { handler } from '../../../supabase/functions/game-declare-retreat/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-declare-retreat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID, game_id: GAME_ID, system_key: '1,-1',
  attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID,
  phase: 'attacker_roll', round: 1, status: 'active',
  retreat_declared_by: null,
}

const BASE_GAME = {
  id: GAME_ID,
  map_tiles: {
    '1,-1': { tile_id: 'tile-a' },
    '2,-1': { tile_id: 'tile-b' },
    '3,-1': { tile_id: 'tile-c' },
  },
}

function mockDb({
  player = { id: ATTACKER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  combat = BASE_COMBAT,
  game = BASE_GAME,
  unitsInDest = [{ id: 'u1' }],
  planetsInDest = [],
  updateError = null,
} = {}) {
  const combatUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })

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
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: unitsInDest, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: planetsInDest, error: null }),
            }),
          }),
        }),
      }
    }
  })
  return { combatUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-declare-retreat', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '2,-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when destination is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when combat is complete', async () => {
    mockDb({ combat: { ...BASE_COMBAT, status: 'complete' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '2,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/combat is not active/i)
  })

  it('returns 409 when destination is not in map_tiles', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '9,9' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a valid system/i)
  })

  it('returns 409 when destination is not adjacent to combat system', async () => {
    mockDb()
    // '3,-1' is two hops from '1,-1' in axial — not adjacent
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '3,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })

  it('returns 409 when player has no units or planets in destination', async () => {
    mockDb({ unitsInDest: [], planetsInDest: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '2,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no presence/i)
  })

  it('returns 409 when player has no CCs available', async () => {
    mockDb({ player: { id: ATTACKER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 0 } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '2,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no command counter/i)
  })

  it('sets retreat_declared_by and retreat_destination on success', async () => {
    const { combatUpdateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '2,-1' }))
    expect(res.status).toBe(200)
    expect(combatUpdateMock).toHaveBeenCalledWith({
      retreat_declared_by: ATTACKER_ID,
      retreat_destination: '2,-1',
    })
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-declare-retreat/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function axialNeighborKeys(systemKey: string): string[] {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; destination?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!body.destination || typeof body.destination !== 'string') return errorResponse("'destination' is required")

  const { data: player } = await db
    .from('game_players').select('id, command_tokens')
    .eq('game_id', body.game_id).eq('user_id', userId).maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats').select('*')
    .eq('id', body.combat_id).eq('game_id', body.game_id).maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)
  if (combat.status !== 'active') return errorResponse('Combat is not active', 409)

  if (player.id !== combat.attacker_player_id && player.id !== combat.defender_player_id) {
    return errorResponse('Player is not a participant in this combat', 403)
  }

  const { data: game } = await db
    .from('games').select('map_tiles')
    .eq('id', body.game_id).maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const mapTiles = (game.map_tiles ?? {}) as Record<string, unknown>
  if (!(body.destination in mapTiles)) return errorResponse('Destination is not a valid system', 409)

  const neighbors = axialNeighborKeys(combat.system_key)
  if (!neighbors.includes(body.destination)) {
    return errorResponse('Destination is not adjacent to the combat system', 409)
  }

  // Check player has presence in destination
  const { data: unitsInDest } = await db
    .from('game_player_units').select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', body.destination)
    .eq('player_id', player.id)
    .is('on_planet', null)
    .limit(1)

  const { data: planetsInDest } = await db
    .from('game_player_planets').select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', body.destination)
    .eq('player_id', player.id)
    .limit(1)

  if ((unitsInDest ?? []).length === 0 && (planetsInDest ?? []).length === 0) {
    return errorResponse('No presence in destination system: no units or controlled planets', 409)
  }

  // Check CC availability (strategy token used as proxy for reinforcement CCs)
  const tokens = (player.command_tokens ?? {}) as { strategy?: number }
  if ((tokens.strategy ?? 0) <= 0) {
    return errorResponse('No command counter available in reinforcements', 409)
  }

  const { error } = await db
    .from('game_combats')
    .update({ retreat_declared_by: player.id, retreat_destination: body.destination })
    .eq('id', body.combat_id)
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  return okResponse({ retreat_declared_by: player.id, retreat_destination: body.destination })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-declare-retreat/index.ts tests/functions/game-declare-retreat.test.js
git commit -m "feat: add game-declare-retreat edge function with adjacency and presence validation"
```
