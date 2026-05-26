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
import { handler } from '../../../supabase/functions/game-produce-units/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const SYSTEM_KEY = '1,2'

function makeRequest(body) {
  return new Request('http://localhost/game-produce-units', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_GAME = {
  id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID, round: 1,
  map_tiles: { [SYSTEM_KEY]: { tile_id: 'tile-uuid' } },
}

// Space Dock in system provides production=3; Carrier is being produced at cost=3
const ALL_UNIT_DEFS = [
  { name: 'Carrier', cost: 3, production: null, unit_type: 'ship' },
  { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
  { name: 'Infantry', cost: 0.5, production: null, unit_type: 'ground' },
]

const WARFARE_PLAY_ID = 'warfare-play-uuid'

function mockDb({
  player = { id: PLAYER_ID },
  game = DEFAULT_GAME,
  activation = { id: 'act-uuid' },
  tile = { planets: [{ name: 'Mecatol Rex', resources: 3 }] },
  callerUnits = [{ unit_type: 'Space Dock', count: 1 }],
  ownedPlanets = [{ planet_name: 'Mecatol Rex' }],
  enemyUnits = [],
  existingUnit = null,
  warfarePlay = { id: WARFARE_PLAY_ID },
  warfareResponse = { id: 'response-uuid' },
} = {}) {
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
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: warfarePlay, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: warfareResponse, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: activation, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tile, error: null }),
          }),
        }),
      }
    }
    if (table === 'units') {
      // Both unit lookups (for ordered units and for system units) return all defs;
      // each call uses only the fields it needs.
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS, error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols === 'unit_type, count') {
            // Caller units in system
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: callerUnits, error: null }),
                }),
              }),
            }
          }
          if (cols === 'id') {
            // Enemy units check (neq pattern)
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                  }),
                }),
              }),
            }
          }
          // 'id, count' — existing unit check in production loop
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
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
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: ownedPlanets, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-produce-units', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when units is missing or empty', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when not the active player', async () => {
    mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when system not activated', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when no production-capable units in system', async () => {
    mockDb({ callerUnits: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when exceeds production capacity', async () => {
    // Space Dock capacity=3, requesting 4 units
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 4 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when insufficient resources', async () => {
    // Carrier costs 3 but planet only has 1 resource
    mockDb({ tile: { planets: [{ name: 'Mecatol Rex', resources: 1 }] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when cannot produce ships in enemy-occupied system', async () => {
    mockDb({ enemyUnits: [{ id: 'enemy-unit' }] })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when ground force missing on_planet', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Infantry', count: 1 }],
      planet_exhausts: [],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with produced=true on valid production (new unit row)', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  describe('warfare_secondary path', () => {
    const warfareBody = {
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
      warfare_secondary: true,
    }

    it('returns 200 when warfare_secondary=true with valid play and used response', async () => {
      mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other-player' } })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.produced).toBe(true)
    })

    it('returns 409 when warfare_secondary=true but no active Warfare play', async () => {
      mockDb({ warfarePlay: null })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/No active Warfare play/)
    })

    it('returns 409 when warfare_secondary=true but player has no used response', async () => {
      mockDb({ warfareResponse: null })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Warfare secondary not used/)
    })

    it('returns 409 for active_player check when warfare_secondary=false (default)', async () => {
      mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other-player' } })
      const res = await handler(makeRequest({ ...warfareBody, warfare_secondary: false }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Not your turn/)
    })
  })

  it('increments count on existing unit row', async () => {
    const existingUnit = { id: 'existing-unit', count: 2 }
    mockDb({ existingUnit })
    let updateArgs = null
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        const updateMock = vi.fn().mockImplementation((args) => {
          updateArgs = args
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return { ...obj, update: updateMock }
      }
      return obj
    })
    await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(updateArgs).toEqual({ count: 3 })
  })
})
