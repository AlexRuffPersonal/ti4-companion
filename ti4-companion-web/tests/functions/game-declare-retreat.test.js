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

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_DECLARE_RETREAT: 'declare_retreat',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-declare-retreat/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const COMBAT_ID = 'combat-uuid'
const DEFENDER_ID = 'defender-uuid'

// System layout for BFS tests:
// combat system: '1,-1'
// 1-hop neighbor: '0,-1' (axial neighbor of '1,-1')
// 2-hop: '0,0' (neighbor of '0,-1', not of '1,-1')
// 3-hop: '-1,0' (neighbor of '0,0', not of '1,-1' or '0,-1')
const COMBAT_SYSTEM = '1,-1'
const ONE_HOP_DEST = '0,-1'    // direct neighbor of COMBAT_SYSTEM
const TWO_HOP_DEST = '-1,-1'   // 2 hops: 1,-1 → 0,-1 → -1,-1
const THREE_HOP_DEST = '-2,-1' // 3 hops: 1,-1 → 0,-1 → -1,-1 → -2,-1

const MAP_TILES = {
  [COMBAT_SYSTEM]: { tile_id: 'tile-a' },
  [ONE_HOP_DEST]: { tile_id: 'tile-b' },
  [TWO_HOP_DEST]: { tile_id: 'tile-c' },
  [THREE_HOP_DEST]: { tile_id: 'tile-d' },
}

function makeRequest(body) {
  return new Request('http://localhost/game-declare-retreat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function makeCombat(overrides = {}) {
  return {
    id: COMBAT_ID,
    game_id: GAME_ID,
    system_key: COMBAT_SYSTEM,
    status: 'active',
    attacker_player_id: PLAYER_ID,
    defender_player_id: DEFENDER_ID,
    retreat_declared_by: null,
    retreat_destination: null,
    ...overrides,
  }
}

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 2 } },
  combat = makeCombat(),
  game = { map_tiles: MAP_TILES },
  retreatingPlayerTechs = [],
  unitsInDest = [{ id: 'unit-1' }],
  planetsInDest = [],
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn((field, value) => {
            if (field === 'game_id') {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }
            }
            if (field === 'id') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { technologies: retreatingPlayerTechs },
                  error: null,
                }),
              }
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
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
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: unitsInDest, error: null }),
                }),
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
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: planetsInDest, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-declare-retreat', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(401)
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when combat_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when destination is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when combat is not active', async () => {
    mockDb({ combat: makeCombat({ status: 'resolved' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(409)
  })

  it('returns 403 when player is not a combat participant', async () => {
    mockDb({ combat: makeCombat({ attacker_player_id: 'someone-else', defender_player_id: DEFENDER_ID }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when destination is not in map_tiles', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: '99,99' }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when player has no presence in destination', async () => {
    mockDb({ unitsInDest: [], planetsInDest: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no presence/i)
  })

  it('returns 409 when no command counter in reinforcements', async () => {
    mockDb({ player: { id: PLAYER_ID, command_tokens: { tactic_total: 0 } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no command counter/i)
  })

  it('GIVEN no Dark Energy Tap destination 1 hop away EXPECT retreat accepted (regression)', async () => {
    mockDb({ retreatingPlayerTechs: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.retreat_declared_by).toBe(PLAYER_ID)
    expect(body.retreat_destination).toBe(ONE_HOP_DEST)
  })

  it('GIVEN no Dark Energy Tap destination 2 hops away EXPECT 409', async () => {
    mockDb({ retreatingPlayerTechs: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: TWO_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })

  it('GIVEN Dark Energy Tap destination 2 hops away EXPECT retreat accepted', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: TWO_HOP_DEST }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.retreat_destination).toBe(TWO_HOP_DEST)
  })

  it('GIVEN Dark Energy Tap destination 3 hops away EXPECT 409', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: THREE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })
})
