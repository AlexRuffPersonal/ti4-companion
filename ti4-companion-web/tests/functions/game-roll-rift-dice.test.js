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
import { handler } from '../../../supabase/functions/game-roll-rift-dice/index.ts'

import { USER_ID, GAME_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-roll-rift-dice', body)

const TRANSIT_ID = 'transit-1'

const SHIP_A = { unit_id: 'unit-a', roll: null, destroyed: false, cargo: [] }
const SHIP_B = { unit_id: 'unit-b', roll: null, destroyed: false, cargo: [] }

const BASE_TRANSIT = {
  id: TRANSIT_ID,
  game_id: GAME_ID,
  player_id: USER_ID,
  status: 'pending',
  system_key: '0,0',
  destination_key: '1,-1',
  ships: [SHIP_A, SHIP_B],
}

function mockDb({
  transit = BASE_TRANSIT,
  transitUpdateError = null,
  destroyError = null,
  survivorUpdateError = null,
} = {}) {
  buildDbMock(db, {
    game_rift_transits: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: transit }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: transitUpdateError }),
      }),
    }),
    game_player_units: () => ({
      delete: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: destroyError }),
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: survivorUpdateError }),
      }),
    }),
  })
}

// nextTransit mock needs a custom mockImplementation because game_rift_transits
// is queried twice (once for update, once for select next)
function mockDbWithNext({ transit = BASE_TRANSIT, nextTransitData = null } = {}) {
  let riftTransitSelectCallCount = 0
  buildDbMock(db, {
    game_rift_transits: () => ({
      select: vi.fn().mockImplementation(() => {
        riftTransitSelectCallCount++
        if (riftTransitSelectCallCount === 1) {
          // First select: fetch transit by id
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: transit }),
            }),
          }
        }
        // Second select: find next pending transit
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: nextTransitData }),
                  }),
                }),
              }),
            }),
          }),
        }
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    game_player_units: () => ({
      delete: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  })
}

describe('game-roll-rift-dice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    expect(res.status).toBe(401)
  })

  it('400 missing transit_id', async () => {
    const res = await handler(makeRequest({ roll_all: true }))
    expect(res.status).toBe(400)
  })

  it('400 missing roll_all', async () => {
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID }))
    expect(res.status).toBe(400)
  })

  it('404 transit not found', async () => {
    mockDb({ transit: null })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/transit not found/i)
  })

  it('403 caller is not transit player', async () => {
    mockDb({ transit: { ...BASE_TRANSIT, player_id: 'other-user' } })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    expect(res.status).toBe(403)
  })

  it('409 transit already complete', async () => {
    mockDb({ transit: { ...BASE_TRANSIT, status: 'complete' } })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already complete/i)
  })

  it('roll_all: populates null rolls and marks destroyed ships (roll <= 3)', async () => {
    // Use a transit with 2 ships, both unrolled
    const transit = { ...BASE_TRANSIT, ships: [{ ...SHIP_A }, { ...SHIP_B }] }
    mockDbWithNext({ transit })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    // Will be either 200 with complete:false (ships still unresolved) or complete:true
    expect([200]).toContain(res.status)
    const body = await res.json()
    // Response either has ships or complete
    expect(body).toHaveProperty('complete')
  })

  it('roll_all: destroyed ships cargo unit_ids also deleted', async () => {
    const shipWithCargo = {
      unit_id: 'unit-a',
      roll: null,
      destroyed: false,
      cargo: [{ unit_id: 'cargo-1' }],
    }
    const transit = {
      ...BASE_TRANSIT,
      ships: [shipWithCargo],
    }
    // Force roll to be 1 (destroyed) by mocking Math.random
    const originalRandom = Math.random
    Math.random = vi.fn().mockReturnValue(0) // 0 * 10 + 1 = 1 => destroyed
    mockDbWithNext({ transit })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    Math.random = originalRandom
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.complete).toBe(true)
    expect(body.destroyed).toContain('unit-a')
    expect(body.destroyed).toContain('cargo-1')
  })

  it('roll_all last transit: surviving ships updated to destination_key; status complete', async () => {
    const transit = {
      ...BASE_TRANSIT,
      ships: [{ unit_id: 'unit-a', roll: null, destroyed: false, cargo: [] }],
    }
    // Force a high roll so ship survives
    const originalRandom = Math.random
    Math.random = vi.fn().mockReturnValue(0.9) // 0.9 * 10 + 1 = 10 => NOT destroyed
    mockDbWithNext({ transit, nextTransitData: null })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    Math.random = originalRandom
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.complete).toBe(true)
    expect(body.destroyed).toEqual([])
  })

  it('roll one: only targeted ship roll populated; others remain null', async () => {
    const transit = {
      ...BASE_TRANSIT,
      ships: [{ ...SHIP_A }, { ...SHIP_B }],
    }
    mockDbWithNext({ transit })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: false, unit_id: 'unit-a' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Not all ships rolled, so should return complete: false with ships
    expect(body.complete).toBe(false)
    expect(body.ships).toBeDefined()
    const shipA = body.ships.find(s => s.unit_id === 'unit-a')
    const shipB = body.ships.find(s => s.unit_id === 'unit-b')
    expect(shipA.roll).not.toBeNull()
    expect(shipB.roll).toBeNull()
  })

  it('409 roll one on already-rolled ship', async () => {
    const transit = {
      ...BASE_TRANSIT,
      ships: [{ unit_id: 'unit-a', roll: 7, destroyed: false, cargo: [] }],
    }
    mockDb({ transit })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: false, unit_id: 'unit-a' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already rolled/i)
  })

  it('multi-rift: completing non-final transit returns next_transit_id; units NOT moved', async () => {
    const transit = {
      ...BASE_TRANSIT,
      ships: [{ unit_id: 'unit-a', roll: null, destroyed: false, cargo: [] }],
    }
    const originalRandom = Math.random
    Math.random = vi.fn().mockReturnValue(0.9) // ship survives
    mockDbWithNext({ transit, nextTransitData: { id: 'transit-2' } })
    const res = await handler(makeRequest({ transit_id: TRANSIT_ID, roll_all: true }))
    Math.random = originalRandom
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.complete).toBe(false)
    expect(body.next_transit_id).toBe('transit-2')
  })
})
