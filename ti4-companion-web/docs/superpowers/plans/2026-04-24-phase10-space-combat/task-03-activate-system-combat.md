# Task 03: Modify game-activate-system — Combat Creation

**Files:**
- Modify: `supabase/functions/game-activate-system/index.ts`
- Create: `tests/functions/game-activate-system.phase10.test.js`

**Context:** After the existing tactic-token and duplicate-activation checks pass, detect enemy ships in the activated system. If found, create a `game_combats` row with space_cannon_pending populated. The existing activation insert still runs; the response gains an optional `combat_id`.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-activate-system.phase10.test.js`:

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
const PLAYER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  game = { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: { '1,-1': { tile_id: 'tile-a' } } },
  activations = [],
  enemyUnits = [{ player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' }],
  scUnitDefs = [],
  tiles = [{ id: 'tile-a', wormhole: null }],
  combatInsertId = COMBAT_ID,
} = {}) {
  const activationInsertMock = vi.fn().mockResolvedValue({ error: null })
  const combatInsertMock = vi.fn().mockResolvedValue({
    data: [{ id: combatInsertId }],
    error: null,
  })

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
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: null }),
            }),
          }),
        }),
        insert: activationInsertMock,
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: scUnitDefs, error: null }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        insert: combatInsertMock,
      }
    }
  })
  return { activationInsertMock, combatInsertMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-activate-system — combat creation (Phase 10)', () => {
  it('returns combat_id when enemy ships are present in activated system', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBe(COMBAT_ID)
  })

  it('returns combat_id: null when no enemy ships in system', async () => {
    mockDb({ enemyUnits: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBeNull()
  })

  it('inserts combat row when enemy ships found', async () => {
    const { combatInsertMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(combatInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: GAME_ID,
        system_key: '1,-1',
        attacker_player_id: PLAYER_ID,
        defender_player_id: DEFENDER_ID,
      })
    )
  })

  it('sets phase to attacker_roll when no space cannon units present', async () => {
    const { combatInsertMock } = mockDb({ scUnitDefs: [] })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('attacker_roll')
    expect(insertArg.space_cannon_pending).toEqual([])
  })

  it('sets phase to space_cannon and populates pending when sc units exist', async () => {
    const { combatInsertMock } = mockDb({
      scUnitDefs: [{ name: 'pds', space_cannon: '5(x3)' }],
      enemyUnits: [
        { player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' },
        { player_id: PLAYER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('space_cannon')
    expect(insertArg.space_cannon_pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ player_id: PLAYER_ID, unit_type: 'pds', dice_count: 3, resolved: false }),
      ])
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/functions/game-activate-system.phase10.test.js
```

Expected: FAIL — existing handler returns `{ activated: true }` without `combat_id`.

- [ ] **Step 3: Modify `supabase/functions/game-activate-system/index.ts`**

Replace the full file with:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitRow = { player_id: string; unit_type: string; count: number; system_key: string }
type ScDef = { name: string; space_cannon: string }
type TileRow = { id: string; wormhole: string | null }
type MapTileRef = { tile_id: string }

function parseDiceCount(text: string): number {
  const m = text.match(/\(x(\d+)\)/)
  return m ? parseInt(m[1]) : 1
}

function axialNeighbors(systemKey: string): string[] {
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
    .select('id, active_player_id, round, map_tiles')
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

  if ((activations ?? []).length >= tacticTotal) return errorResponse('No tactic tokens available', 409)
  if ((activations ?? []).some((a: { system_key: string }) => a.system_key === body.system_key)) {
    return errorResponse('System already activated by you this round', 409)
  }

  // Detect enemy ships in activated system (space only)
  const { data: systemUnits } = await db
    .from('game_player_units')
    .select('player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .eq('system_key', body.system_key)
    .is('on_planet', null)

  const enemyUnits = (systemUnits ?? []).filter((u: UnitRow) => u.player_id !== player.id)

  let combatId: string | null = null

  if (enemyUnits.length > 0) {
    const defenderPlayerId = enemyUnits[0].player_id

    // Build relevant system set: activated + axial neighbors + wormhole-connected
    const neighborKeys = axialNeighbors(body.system_key)
    const mapTiles = (game.map_tiles ?? {}) as Record<string, MapTileRef>
    const tileIds = Object.values(mapTiles).map((t) => t.tile_id)

    const { data: tilesData } = await db
      .from('tiles')
      .select('id, wormhole')
      .in('id', tileIds.length > 0 ? tileIds : ['__none__'])

    const sysWormholes: Record<string, string> = {}
    for (const [sk, ref] of Object.entries(mapTiles)) {
      const tile = (tilesData ?? []).find((t: TileRow) => t.id === ref.tile_id)
      if (tile?.wormhole) sysWormholes[sk] = tile.wormhole
    }
    const activatedWh = sysWormholes[body.system_key]
    const whConnected: string[] = activatedWh
      ? Object.entries(sysWormholes)
          .filter(([sk, wh]) => sk !== body.system_key && wh === activatedWh)
          .map(([sk]) => sk)
      : []

    const relevantSystems = [body.system_key, ...neighborKeys, ...whConnected]

    // Fetch nearby space units for all relevant systems
    const { data: nearbyUnits } = await db
      .from('game_player_units')
      .select('player_id, unit_type, count, system_key')
      .eq('game_id', body.game_id)
      .is('on_planet', null)

    const relevantUnits = (nearbyUnits ?? []).filter((u: UnitRow) =>
      relevantSystems.includes(u.system_key)
    )

    // Get space cannon unit definitions
    const { data: scDefs } = await db
      .from('units')
      .select('name, space_cannon')
      .not('space_cannon', 'is', null)

    const scMap = new Map((scDefs ?? []).map((u: ScDef) => [u.name, u.space_cannon]))

    // Build space_cannon_pending: one entry per (player, system) with sc units
    type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
    const spPending: SpEntry[] = []
    const seen = new Set<string>()

    for (const unit of relevantUnits) {
      if (!scMap.has(unit.unit_type)) continue
      const key = `${unit.player_id}:${unit.system_key}`
      if (seen.has(key)) continue
      seen.add(key)
      spPending.push({
        player_id: unit.player_id,
        system_key: unit.system_key,
        unit_type: unit.unit_type,
        dice_count: parseDiceCount(scMap.get(unit.unit_type)!),
        resolved: false,
      })
    }

    const initialPhase = spPending.length > 0 ? 'space_cannon' : 'attacker_roll'

    const { data: combatRows, error: combatInsertError } = await db
      .from('game_combats')
      .insert({
        game_id: body.game_id,
        system_key: body.system_key,
        attacker_player_id: player.id,
        defender_player_id: defenderPlayerId,
        phase: initialPhase,
        space_cannon_pending: spPending,
      })
      .select('id')
    if (combatInsertError) return errorResponse(`Failed to create combat: ${combatInsertError.message}`, 500)
    combatId = combatRows?.[0]?.id ?? null
  }

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

  return okResponse({ activated: true, combat_id: combatId })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run both test files to verify they pass**

```bash
npx vitest run tests/functions/game-activate-system.test.js tests/functions/game-activate-system.phase10.test.js
```

Expected: all tests pass (existing 8 + new 5).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-activate-system/index.ts tests/functions/game-activate-system.phase10.test.js
git commit -m "feat: detect enemy ships and create combat row in game-activate-system"
```
