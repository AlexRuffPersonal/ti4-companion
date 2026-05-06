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
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OTHER_PLAYER_ID = 'other-player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-research-technology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GAME = { status: 'active', expansions: { base: true } }
const BASE_TECH = { name: 'Neural Motivator', technology_type: 'green', prerequisites: {}, expansion: 'base' }
const BASE_UNIT_UPGRADE = { name: 'Dreadnought II', technology_type: 'unit_upgrade', prerequisites: { blue: 2 }, expansion: 'base' }
const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
  trade_goods: 5,
}

let updatePlayerMock, updateGameMock

function mockDb({ game = BASE_GAME, tech = BASE_TECH, player = BASE_PLAYER, allTechs = [BASE_TECH, BASE_UNIT_UPGRADE], planets = [], updateError = null, eligibleCardRows = [] } = {}) {
  updatePlayerMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  updateGameMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }) }) }),
        update: updateGameMock,
      }
    }
    if (table === 'technologies') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('prerequisites')) {
            return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }) }) }
          }
          return { then: (cb) => Promise.resolve({ data: allTechs, error: null }).then(cb) }
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: planets, error: null }) }) }),
        update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({ data: eligibleCardRows, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-research-technology', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ tech_name: 'Neural Motivator' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when tech_name is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 200 when tech with no prereqs is researched successfully', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.researched).toBe(true)
  })

  it('returns 409 when tech is already owned', async () => {
    mockDb({ player: { ...BASE_PLAYER, technologies: ['Neural Motivator'] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
    expect(res.status).toBe(409)
  })

  describe('AI Development Algorithm (Phase 30)', () => {
    it('skips all prereqs for unit upgrade when use_ai_dev_algo=true and AIDA is unexhausted', async () => {
      mockDb({
        tech: BASE_UNIT_UPGRADE,
        player: { ...BASE_PLAYER, technologies: ['AI Development Algorithm'], exhausted_technologies: [] },
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        tech_name: 'Dreadnought II',
        selections: { use_ai_dev_algo: true },
      }))
      expect(res.status).toBe(200)
    })

    it('exhausts AI Development Algorithm after use', async () => {
      let capturedUpdate = null
      db.from.mockImplementation((table) => {
        if (table === 'games') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        }
        if (table === 'technologies') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_UNIT_UPGRADE }) }) }) }
        }
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...BASE_PLAYER, technologies: ['AI Development Algorithm'], exhausted_technologies: [] } }) }) }) }),
            update: vi.fn().mockImplementation((data) => { capturedUpdate = data; return { eq: vi.fn().mockResolvedValue({ error: null }) } }),
          }
        }
        if (table === 'game_action_card_deck') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }) }
        }
        return {}
      })
      await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Dreadnought II', selections: { use_ai_dev_algo: true } }))
      expect(capturedUpdate?.exhausted_technologies).toContain('AI Development Algorithm')
    })

    it('does not skip prereqs when use_ai_dev_algo=false', async () => {
      mockDb({
        tech: BASE_UNIT_UPGRADE,
        player: { ...BASE_PLAYER, technologies: ['AI Development Algorithm'], exhausted_technologies: [] },
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        tech_name: 'Dreadnought II',
        selections: { use_ai_dev_algo: false },
      }))
      // Missing prereqs (no blue techs) → should fail
      expect(res.status).toBe(400)
    })
  })

  describe('Inheritance Systems (Phase 30)', () => {
    it('skips all prereqs when use_inheritance=true and sufficient resources', async () => {
      mockDb({
        tech: BASE_UNIT_UPGRADE,
        player: { ...BASE_PLAYER, technologies: ['Inheritance Systems'], trade_goods: 2 },
        planets: [],
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        tech_name: 'Dreadnought II',
        selections: { use_inheritance: true },
      }))
      expect(res.status).toBe(200)
    })

    it('returns 409 when insufficient resources for Inheritance Systems', async () => {
      mockDb({
        tech: BASE_UNIT_UPGRADE,
        player: { ...BASE_PLAYER, technologies: ['Inheritance Systems'], trade_goods: 0 },
        planets: [],
      })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        tech_name: 'Dreadnought II',
        selections: { use_inheritance: true },
      }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/insufficient resources/i)
    })

    it('exhausts Inheritance Systems after use', async () => {
      let capturedUpdate = null
      db.from.mockImplementation((table) => {
        if (table === 'games') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
        }
        if (table === 'technologies') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_UNIT_UPGRADE }) }) }) }
        }
        if (table === 'game_players') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...BASE_PLAYER, technologies: ['Inheritance Systems'], trade_goods: 5 } }) }) }) }),
            update: vi.fn().mockImplementation((data) => { capturedUpdate = data; return { eq: vi.fn().mockResolvedValue({ error: null }) } }),
          }
        }
        if (table === 'game_player_planets') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
        }
        if (table === 'game_action_card_deck') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }) }
        }
        return {}
      })
      await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Dreadnought II', selections: { use_inheritance: true } }))
      expect(capturedUpdate?.exhausted_technologies).toContain('Inheritance Systems')
    })
  })

  describe('after_technology_researched action window', () => {
    it('GIVEN another player holds After-tech-researched card — sets pending_action_window', async () => {
      mockDb({ eligibleCardRows: [{ held_by_player_id: OTHER_PLAYER_ID }] })
      const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
      expect(res.status).toBe(200)
      const windowCall = updateGameMock.mock.calls.find(
        ([arg]) => arg && arg.pending_action_window !== undefined
      )
      expect(windowCall).toBeDefined()
      expect(windowCall[0].pending_action_window).toMatchObject({
        type: 'after_technology_researched',
        eligible_player_ids: [OTHER_PLAYER_ID],
        context: { technology_name: 'Neural Motivator' },
      })
    })

    it('GIVEN only the researching player holds such a card — no window opened', async () => {
      mockDb({ eligibleCardRows: [] })
      await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
      const windowCall = updateGameMock.mock.calls.find(
        ([arg]) => arg && arg.pending_action_window !== undefined
      )
      expect(windowCall).toBeUndefined()
    })

    it('GIVEN no player holds such a card — no window opened', async () => {
      mockDb({ eligibleCardRows: [] })
      await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
      const windowCall = updateGameMock.mock.calls.find(
        ([arg]) => arg && arg.pending_action_window !== undefined
      )
      expect(windowCall).toBeUndefined()
    })
  })
})
