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
  EVT_DEPLOY_MECH: 'deploy_mech',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-deploy-mech/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const UNIT_ID = 'unit-uuid'
const FACTION = 'The Federation of Sol'

function makeRequest(body) {
  return new Request('http://localhost/game-deploy-mech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_BODY = {
  game_id: GAME_ID,
  unit_id: UNIT_ID,
  system_key: '1,-1',
  target_planet_name: 'Wellon',
}

function mockDb({
  player = { id: PLAYER_ID, faction: FACTION },
  unit = { id: UNIT_ID, unit_type: 'mech', faction: FACTION },
  planetRow = { id: 'planet-row-uuid' },
  existingMech = null,
  insertMechError = null,
  infantryRow = null,
  game = { round: 2 },
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
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: unit, error: null }),
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
                maybeSingle: vi.fn().mockResolvedValue({ data: planetRow, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      let callCount = 0
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation(() => {
                    callCount++
                    // first call = mech lookup, second = infantry lookup
                    const data = callCount === 1 ? existingMech : infantryRow
                    return { maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: insertMechError }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
    return {}
  })
}

describe('game-deploy-mech', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    mockDb()
  })

  it('returns 204 for CORS preflight', async () => {
    const req = new Request('http://localhost/game-deploy-mech', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ unit_id: UNIT_ID, system_key: '1,-1', target_planet_name: 'Wellon' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when unit_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', target_planet_name: 'Wellon' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when unit is not a mech', async () => {
    mockDb({ unit: { id: UNIT_ID, unit_type: 'infantry', faction: FACTION } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a mech/i)
  })

  it('returns 409 when faction mismatch', async () => {
    mockDb({ unit: { id: UNIT_ID, unit_type: 'mech', faction: 'Mentak Coalition' } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction mismatch/i)
  })

  it('returns 409 when planet not controlled by player', async () => {
    mockDb({ planetRow: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not controlled/i)
  })

  it('returns 200 and deploys mech (inserts game_player_units row)', async () => {
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployed).toBe(true)
    expect(logEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: 'deploy_mech' })
    )
  })

  it('returns 200 with replacing_infantry=true and removes one infantry', async () => {
    const infantryRow = { id: 'inf-uuid', count: 2 }
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    // Need to set up infantry removal mock manually
    let unitCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, faction: FACTION }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: UNIT_ID, unit_type: 'mech', faction: FACTION }, error: null }),
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
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'pp-uuid' }, error: null }),
                }),
              }),
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
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockImplementation(() => {
                      unitCallCount++
                      // first call = mech (not found), second = infantry (found with count 2)
                      const data = unitCallCount === 1 ? null : infantryRow
                      return { maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: updateMock,
          delete: deleteMock,
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { round: 2 }, error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ ...BASE_BODY, replacing_infantry: true }))
    expect(res.status).toBe(200)
    // infantry count was 2, so update (not delete) should be called
    expect(updateMock).toHaveBeenCalledWith({ count: 1 })
  })
})
