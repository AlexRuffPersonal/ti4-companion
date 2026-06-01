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

import { USER_ID, GAME_ID, PLAYER_ID, COMBAT_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-declare-retreat', body)

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
  allShipsInDest = [],
  planetsInDest = [],
  updateError = null,
} = {}) {
  buildDbMock(db, {
    game_players: () => ({
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
    }),
    game_combats: () => ({
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
    }),
    games: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
    }),
    game_player_units: () => {
      // Build a chainable mock that tracks whether player_id eq was called
      // DET path: eq(game_id).eq(system_key).is(on_planet, null) → resolves allShipsInDest
      // Non-DET path: eq(game_id).eq(system_key).eq(player_id).is(on_planet, null).limit(1) → resolves unitsInDest
      const isChain = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: unitsInDest, error: null }),
      })
      // For DET path, the chain is eq→eq→is (resolves to allShipsInDest directly from is())
      const detIsChain = vi.fn().mockResolvedValue({ data: allShipsInDest, error: null })
      const innerEqForPlayerCheck = vi.fn().mockReturnValue({
        is: isChain,
      })
      // Second eq (system_key) — may be followed by player_id eq (non-DET) or is() (DET)
      const secondEq = vi.fn((field) => {
        if (field === 'player_id') {
          return { is: isChain }
        }
        // field === 'system_key' — next call will be eq(player_id) OR is(on_planet)
        return {
          eq: innerEqForPlayerCheck,
          is: detIsChain,
        }
      })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: secondEq,
          }),
        }),
      }
    },
    game_player_planets: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: planetsInDest, error: null }),
            }),
          }),
        }),
      }),
    }),
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

  it('GIVEN Dark Energy Tap destination 2 hops away EXPECT 409 (range stays 1 hop)', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: TWO_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })

  it('GIVEN Dark Energy Tap destination 3 hops away EXPECT 409', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: THREE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not adjacent/i)
  })

  // DET empty-system retreat
  it('GIVEN DET destination 1 hop destination completely empty EXPECT 200', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'], allShipsInDest: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.retreat_declared_by).toBe(PLAYER_ID)
    expect(body.retreat_destination).toBe(ONE_HOP_DEST)
  })

  it('GIVEN DET destination 1 hop destination has any ships EXPECT 409', async () => {
    mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'], allShipsInDest: [{ id: 'enemy-ship' }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/must be empty/i)
  })

  // Non-DET regressions
  it('GIVEN no DET destination 1 hop own units in dest EXPECT 200', async () => {
    mockDb({ retreatingPlayerTechs: [], unitsInDest: [{ id: 'unit-1' }], planetsInDest: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(200)
  })

  it('GIVEN no DET destination 1 hop own planets in dest EXPECT 200', async () => {
    mockDb({ retreatingPlayerTechs: [], unitsInDest: [], planetsInDest: [{ id: 'planet-1' }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(200)
  })

  it('GIVEN no DET destination 1 hop no own presence EXPECT 409', async () => {
    mockDb({ retreatingPlayerTechs: [], unitsInDest: [], planetsInDest: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no presence/i)
  })
})
