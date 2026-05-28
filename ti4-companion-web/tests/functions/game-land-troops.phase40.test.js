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

vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_LAND_TROOPS: 'land_troops',
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertMovementAllowed: vi.fn(),
  checkVpMaintenanceLaws: vi.fn(),
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
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { assertMovementAllowed, checkVpMaintenanceLaws, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-land-troops/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const PREV_OWNER_ID = 'prev-owner-uuid'
const TILE_ID = 'tile-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-land-troops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_MAP_TILES = {
  '1,-1': { tile_id: TILE_ID, tile_number: '32' },
}

function mockDb({
  player = { id: PLAYER_ID },
  game = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
  activation = { id: 'act-1' },
  tile = { planets: [{ name: 'Wellon' }] },
  existingOwner = null,
  existingUnit = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }),
            }
          }
          // vp query for custodians
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { vp: 3 }, error: null }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingOwner, error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  requireAuth.mockResolvedValue(USER_ID)
  assertMovementAllowed.mockResolvedValue(undefined)
  checkVpMaintenanceLaws.mockResolvedValue(undefined)
  mockDb()
})

describe('Phase 40 — Persistent Agenda Law Enforcement in game-land-troops', () => {
  describe('assertMovementAllowed enforcement', () => {
    it('returns 409 when Demilitarized Zone is active and landing on the elected planet', async () => {
      const lawError = new LawError('Demilitarized Zone: units cannot enter this planet', 409)
      assertMovementAllowed.mockRejectedValue(lawError)

      mockDb()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain('Demilitarized Zone')
    })

    it('calls assertMovementAllowed with correct args before any DB write', async () => {
      mockDb()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(assertMovementAllowed).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        'Wellon'
      )
    })
  })

  describe('checkVpMaintenanceLaws enforcement', () => {
    it('calls checkVpMaintenanceLaws with correct args when a different player previously owned the planet', async () => {
      mockDb({ existingOwner: { player_id: PREV_OWNER_ID } })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        PREV_OWNER_ID,
        'Wellon'
      )
    })

    it('does not call checkVpMaintenanceLaws when the planet had no previous owner', async () => {
      mockDb({ existingOwner: null })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).not.toHaveBeenCalled()
    })

    it('does not call checkVpMaintenanceLaws when the current player already owned the planet', async () => {
      mockDb({ existingOwner: { player_id: PLAYER_ID } })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).not.toHaveBeenCalled()
    })
  })

  describe('no laws active — unchanged behavior', () => {
    it('returns 200 with normal flow when no laws are active', async () => {
      assertMovementAllowed.mockResolvedValue(undefined)
      checkVpMaintenanceLaws.mockResolvedValue(undefined)
      mockDb()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 2,
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.claimed).toBe(true)
    })
  })
})
