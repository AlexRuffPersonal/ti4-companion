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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-research-technology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GAME = { status: 'active', expansions: { base: true } }
const UNIT_UPGRADE_TECH = {
  name: 'Dreadnought II',
  technology_type: 'unit_upgrade',
  prerequisites: { blue: 2 },
  expansion: 'base',
}
const REGULAR_TECH = {
  name: 'Neural Motivator',
  technology_type: 'green',
  prerequisites: {},
  expansion: 'base',
}

function mockDb({ player, tech = UNIT_UPGRADE_TECH, allTechs = [UNIT_UPGRADE_TECH, REGULAR_TECH], planets = [] } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }) }
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
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
                  not: vi.fn().mockResolvedValue({ data: [], error: null }),
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

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-research-technology Phase 30', () => {
  it('AI Development Algorithm: skips prereqs for unit upgrade and exhausts AIDA', async () => {
    let playerUpdateCapture = null
    const player = {
      id: PLAYER_ID,
      technologies: ['AI Development Algorithm'],
      exhausted_technologies: [],
      trade_goods: 0,
    }
    mockDb({ player, tech: UNIT_UPGRADE_TECH })
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('prerequisites')) {
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: UNIT_UPGRADE_TECH, error: null }) }) }
            }
            return { then: (cb) => Promise.resolve({ data: [UNIT_UPGRADE_TECH], error: null }).then(cb) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
          update: vi.fn().mockImplementation((data) => {
            playerUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }) }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Dreadnought II', selections: { use_ai_dev_algo: true } }))
    expect(res.status).toBe(200)
    expect(playerUpdateCapture?.exhausted_technologies).toContain('AI Development Algorithm')
    expect(playerUpdateCapture?.technologies).toContain('Dreadnought II')
  })

  it('Inheritance Systems: skips prereqs, spends 2 resources, exhausts Inheritance Systems', async () => {
    const playerUpdates = []
    const player = {
      id: PLAYER_ID,
      technologies: ['Inheritance Systems'],
      exhausted_technologies: [],
      trade_goods: 3,
    }
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('prerequisites')) {
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: UNIT_UPGRADE_TECH, error: null }) }) }
            }
            return { then: (cb) => Promise.resolve({ data: [UNIT_UPGRADE_TECH], error: null }).then(cb) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
          update: vi.fn().mockImplementation((data) => {
            playerUpdates.push(data)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }) }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Dreadnought II', selections: { use_inheritance: true } }))
    expect(res.status).toBe(200)
    // 2 TG spent from 3 → 1 remaining (first update)
    const tgUpdate = playerUpdates.find((u) => u.trade_goods !== undefined)
    expect(tgUpdate?.trade_goods).toBe(1)
  })

  it('Inheritance Systems: returns 409 when fewer than 2 resources available', async () => {
    const player = {
      id: PLAYER_ID,
      technologies: ['Inheritance Systems'],
      exhausted_technologies: [],
      trade_goods: 1,
    }
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }) }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('prerequisites')) {
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: UNIT_UPGRADE_TECH, error: null }) }) }
            }
            return { then: (cb) => Promise.resolve({ data: [UNIT_UPGRADE_TECH], error: null }).then(cb) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          // no exhausted planets → 0 planet resources
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Dreadnought II', selections: { use_inheritance: true } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/insufficient/i)
  })
})
