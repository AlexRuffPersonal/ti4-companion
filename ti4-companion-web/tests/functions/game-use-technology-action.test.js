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
import { handler } from '../../../supabase/functions/game-use-technology-action/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const CHOSEN_PLAYER_ID = 'chosen-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-use-technology-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: ['Production Biomes', 'Sling Relay', 'X-89 Bacterial Weapon', 'Chaos Mapping'],
  exhausted_technologies: [],
  trade_goods: 0,
  command_tokens: { tactic_total: 3, fleet: 2, strategy: 2 },
  action_card_count: 0,
}

function mockDb(overrides = {}) {
  const player = overrides.player !== undefined ? overrides.player : BASE_PLAYER
  const chosenPlayer = overrides.chosenPlayer !== undefined ? overrides.chosenPlayer : { id: CHOSEN_PLAYER_ID, trade_goods: 0 }
  const unitRow = overrides.unitRow !== undefined ? overrides.unitRow : null

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: chosenPlayer }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
                  is: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: unitRow }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-use-technology-action', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: 'Sling Relay' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ technology_name: 'Sling Relay' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when technology_name is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: 'Sling Relay' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when technology not owned', async () => {
    mockDb({ player: { ...BASE_PLAYER, technologies: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: 'Sling Relay', selections: { system_key: '1,0', unit_type: 'cruiser' } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not owned/i)
  })

  it('returns 409 for exhaustable tech when already exhausted', async () => {
    mockDb({ player: { ...BASE_PLAYER, exhausted_technologies: ['Sling Relay'] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: 'Sling Relay', selections: { system_key: '1,0', unit_type: 'cruiser' } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exhausted/i)
  })

  it('returns 400 for unknown technology', async () => {
    mockDb({ player: { ...BASE_PLAYER, technologies: ['Some Unknown Tech'] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: 'Some Unknown Tech' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })

  describe('Production Biomes', () => {
    it('updates trade goods for both players and spends strategy token', async () => {
      let updates = []
      db.from.mockImplementation((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: BASE_PLAYER }),
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: CHOSEN_PLAYER_ID, trade_goods: 1 } }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              updates.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        return {}
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        technology_name: 'Production Biomes',
        selections: { chosen_player_id: CHOSEN_PLAYER_ID },
      }))
      expect(res.status).toBe(200)
      // Self gets +4, chosen gets +2, strategy token spent, tech exhausted
      expect(updates.some(u => u.trade_goods === 4)).toBe(true)
      expect(updates.some(u => u.trade_goods === 3)).toBe(true)
      expect(updates.some(u => u.exhausted_technologies?.includes('Production Biomes'))).toBe(true)
    })

    it('returns 409 when insufficient strategy tokens', async () => {
      mockDb({ player: { ...BASE_PLAYER, command_tokens: { tactic_total: 3, fleet: 2, strategy: 0 } } })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        technology_name: 'Production Biomes',
        selections: { chosen_player_id: CHOSEN_PLAYER_ID },
      }))
      expect(res.status).toBe(409)
    })
  })

  describe('Sling Relay', () => {
    it('inserts new unit in system and exhausts tech', async () => {
      let inserted = null
      let exhausted = null
      db.from.mockImplementation((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: BASE_PLAYER }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              if (data.exhausted_technologies) exhausted = data
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
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
                      is: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((data) => { inserted = data; return Promise.resolve({ error: null }) }),
          }
        }
        return {}
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        technology_name: 'Sling Relay',
        selections: { system_key: '1,0', unit_type: 'cruiser' },
      }))
      expect(res.status).toBe(200)
      expect(inserted).toBeTruthy()
      expect(inserted.unit_type).toBe('cruiser')
      expect(exhausted?.exhausted_technologies).toContain('Sling Relay')
    })
  })

  describe('Chaos Mapping', () => {
    it('inserts unit without exhausting tech', async () => {
      let inserted = null
      let exhaustCalled = false
      db.from.mockImplementation((table) => {
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: BASE_PLAYER }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              if (data.exhausted_technologies) exhaustCalled = true
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
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
                      is: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((data) => { inserted = data; return Promise.resolve({ error: null }) }),
          }
        }
        return {}
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        technology_name: 'Chaos Mapping',
        selections: { system_key: '2,1', unit_type: 'destroyer' },
      }))
      expect(res.status).toBe(200)
      expect(inserted).toBeTruthy()
      expect(exhaustCalled).toBe(false)
    })
  })
})
