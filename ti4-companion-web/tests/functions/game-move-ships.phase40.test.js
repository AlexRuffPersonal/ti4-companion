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
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertMovementAllowed: vi.fn(),
  assertFleetCapacity: vi.fn(),
  LawError: class LawError extends Error {
    constructor(message, status = 409) {
      super(message)
      this.name = 'LawError'
      this.status = status
    }
  },
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { assertMovementAllowed, assertFleetCapacity, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-move-ships/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ORIGIN_KEY = '2,0'
const DEST_KEY = '1,0'

function makeRequest(body) {
  return new Request('http://localhost/game-move-ships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_GAME = {
  active_player_id: PLAYER_ID,
  round: 1,
  map_tiles: {
    [ORIGIN_KEY]: { tile_id: 'tile-origin' },
    [DEST_KEY]: { tile_id: 'tile-dest' },
  },
}

const CARRIER_DEF = { name: 'carrier', move: 2, capacity: 4 }

function mockDb({
  player = { id: PLAYER_ID },
  game = DEFAULT_GAME,
  spaceUnits = [{ id: 'unit-1', player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: ORIGIN_KEY }],
  activations = [],
  tiles = [
    { id: 'tile-origin', anomalies: [], wormholes: [] },
    { id: 'tile-dest', anomalies: [], wormholes: [] },
  ],
  unitDefs = [CARRIER_DEF],
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: spaceUnits }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs }),
        }),
      }
    }
    return {}
  })
}

describe('game-move-ships Phase 40 — Persistent Agenda Law Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    assertMovementAllowed.mockResolvedValue(undefined)
    assertFleetCapacity.mockResolvedValue(undefined)
    mockDb()
  })

  describe('assertFleetCapacity enforcement', () => {
    it('returns 409 when Fleet Regulations active and fleet size exceeds max-2', async () => {
      const lawError = new LawError('Fleet Regulations: fleet size exceeds reduced maximum', 409)
      assertFleetCapacity.mockRejectedValue(lawError)

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain('Fleet Regulations')
    })

    it('calls assertFleetCapacity with ships.length as fleet size', async () => {
      mockDb({
        spaceUnits: [
          { id: 'unit-1', player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: ORIGIN_KEY },
          { id: 'unit-2', player_id: PLAYER_ID, unit_type: 'carrier', count: 1, system_key: ORIGIN_KEY },
        ],
        unitDefs: [CARRIER_DEF],
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [
          { unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] },
          { unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] },
        ],
      }))

      expect(res.status).toBe(200)
      expect(assertFleetCapacity).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        PLAYER_ID,
        2,
      )
    })
  })

  describe('assertMovementAllowed enforcement', () => {
    it('Demilitarized Zone active + ship moving to elected planet → 409', async () => {
      const lawError = new LawError('Demilitarized Zone: cannot move ships to Mecatol Rex', 409)
      assertMovementAllowed.mockRejectedValue(lawError)

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
        destination_planets: ['Mecatol Rex'],
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain('Demilitarized Zone')
    })

    it('calls assertMovementAllowed for each destination planet', async () => {
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
        destination_planets: ['Mecatol Rex', 'Jord'],
      }))

      expect(res.status).toBe(200)
      expect(assertMovementAllowed).toHaveBeenCalledTimes(2)
      expect(assertMovementAllowed).toHaveBeenCalledWith(expect.anything(), GAME_ID, 'Mecatol Rex')
      expect(assertMovementAllowed).toHaveBeenCalledWith(expect.anything(), GAME_ID, 'Jord')
    })

    it('omitting destination_planets skips assertMovementAllowed', async () => {
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
      }))

      expect(res.status).toBe(200)
      expect(assertMovementAllowed).not.toHaveBeenCalled()
    })
  })

  describe('no laws active — unchanged behavior', () => {
    it('returns 200 with normal move when no laws are active', async () => {
      assertMovementAllowed.mockResolvedValue(undefined)
      assertFleetCapacity.mockResolvedValue(undefined)

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        active_system_key: DEST_KEY,
        ships: [{ unit_type: 'carrier', origin_system_key: ORIGIN_KEY, path: [ORIGIN_KEY, DEST_KEY], cargo: [] }],
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.moved).toBe(true)
    })
  })
})
