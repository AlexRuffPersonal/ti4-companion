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
  EVT_RESEARCH_TECH: 'research_technology',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'

const makeRequest = (body) => _makeRequest('game-research-technology', body)

const OTHER_PLAYER_ID = 'other-player-uuid'

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

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator' }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'research_technology' }))
  })
})

// ---------------------------------------------------------------------------
// Phase 30 — extended AI Dev Algo / Inheritance Systems coverage
// ---------------------------------------------------------------------------

describe('phase 30 — AI Development Algorithm / Inheritance Systems (extended)', () => {
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

  function mockDbP30({ player, tech = UNIT_UPGRADE_TECH, allTechs = [UNIT_UPGRADE_TECH, REGULAR_TECH], planets = [] } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
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

  it('AI Development Algorithm: skips prereqs for unit upgrade and exhausts AIDA', async () => {
    let playerUpdateCapture = null
    const player = {
      id: PLAYER_ID,
      technologies: ['AI Development Algorithm'],
      exhausted_technologies: [],
      trade_goods: 0,
    }
    mockDbP30({ player, tech: UNIT_UPGRADE_TECH })
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

// ---------------------------------------------------------------------------
// Phase 39b — Research Agreement promissory note
// ---------------------------------------------------------------------------

describe('phase 39b — Research Agreement', () => {
  const HOLDER_ID = 'holder-uuid'
  const NOTE_INSTANCE_ID = 'note-instance-uuid'

  const NON_FACTION_TECH = {
    name: 'Neural Motivator',
    technology_type: 'green',
    prerequisites: {},
    expansion: 'base',
  }

  const FACTION_TECH = {
    name: 'Quantum Entanglement',
    technology_type: 'faction',
    prerequisites: {},
    expansion: 'base',
  }

  let holderUpdateEqMock

  function mockDbP39b({ tech = NON_FACTION_TECH, holderTechs = [] } = {}) {
    holderUpdateEqMock = vi.fn().mockResolvedValue({ error: null })

    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'active', expansions: { base: true } },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols && cols.includes('technologies') && !cols.includes('exhausted')) {
              // holder player query
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { technologies: holderTechs },
                    error: null,
                  }),
                }),
              }
            }
            // main player query
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation(() => ({ eq: holderUpdateEqMock })),
        }
      }
      if (table === 'game_player_planets') {
        return {
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

  it('Research Agreement held, Jol-Nar researches non-faction tech → holder also gets tech; note returned', async () => {
    const note = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: PLAYER_ID }
    getHeldNotes.mockResolvedValue([note])
    mockDbP39b({ tech: NON_FACTION_TECH, holderTechs: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    expect(getHeldNotes).toHaveBeenCalledWith(GAME_ID, 'Research Agreement', expect.anything())
    // Holder player should have received the tech (update called with holder's id)
    expect(holderUpdateEqMock).toHaveBeenCalledWith('id', HOLDER_ID)
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, PLAYER_ID, expect.anything())
  })

  it('Research Agreement held, Jol-Nar researches faction tech → no grant, no returnNote', async () => {
    const note = { instanceId: NOTE_INSTANCE_ID, holderPlayerId: HOLDER_ID, ownerPlayerId: PLAYER_ID }
    getHeldNotes.mockResolvedValue([note])
    mockDbP39b({ tech: FACTION_TECH, holderTechs: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Quantum Entanglement', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    // Holder player should NOT have received the tech (update never called with holder's id)
    expect(holderUpdateEqMock).not.toHaveBeenCalledWith('id', HOLDER_ID)
    expect(returnNote).not.toHaveBeenCalled()
  })

  it('Research Agreement not held → no grant, no returnNote', async () => {
    getHeldNotes.mockResolvedValue([])
    mockDbP39b({ tech: NON_FACTION_TECH })

    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: 'Neural Motivator', bypass_prerequisites: true }))
    expect(res.status).toBe(200)

    expect(returnNote).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Phase 43c — commander passives
// ---------------------------------------------------------------------------

describe('phase 43c — commander passives', () => {
  const BLUE_TECH = {
    name: 'Neural Motivator',
    technology_type: 'green',
    prerequisites: { blue: 1 },
    expansion: 'base',
  }

  const ALL_TECHS = [
    BLUE_TECH,
    { name: 'Sling Relay', technology_type: 'blue', prerequisites: {} },
  ]

  function mockDbP43c({
    player = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
    tech = BLUE_TECH,
    allTechs = ALL_TECHS,
    planets = [],
  } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols && cols.includes('prerequisites')) {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }),
                }),
              }
            }
            // allTechs query (no filter) for prereq colour counting
            return {
              then: undefined,
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }),
              }),
              [Symbol.iterator]: undefined,
            }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
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
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with TECH_RESEARCHED trigger', async () => {
    mockDbP43c({
      player: { id: PLAYER_ID, technologies: ['Sling Relay'], exhausted_technologies: [], trade_goods: 0 },
      tech: { name: 'Neural Motivator', technology_type: 'green', prerequisites: { blue: 1 }, expansion: 'base' },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      tech_name: 'Neural Motivator',
      bypass_prerequisites: true,
    }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'TECH_RESEARCHED',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID }),
      expect.anything(),
    )
  })

  it('Nekro commander — pending_window emitted after research', async () => {
    mockDbP43c({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tech: { name: 'Neural Motivator', technology_type: 'green', prerequisites: {}, expansion: 'base' },
    })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'TECH_RESEARCHED',
        faction: 'The Nekro Virus',
        player_id: 'nekro-player-id',
        effect: [{ op: 'draw_action_card' }],
      }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      tech_name: 'Neural Motivator',
      bypass_prerequisites: true,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Nekro Virus')
  })

  it('Yin Omar — ignoreOnePrerequisite bypasses 1 missing prereq colour', async () => {
    // Player has 0 blue techs but needs 1 blue for BLUE_TECH; Yin Omar grants 1 forgiveness
    mockDbP43c({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tech: BLUE_TECH,
      allTechs: ALL_TECHS,
    })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Yin Brotherhood', effect: 'yin_omar_passive' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.ignoreOnePrerequisite = true
      ctx.extraInfantryFree = 1
    }))

    // Need to mock allTechs query used for colour counting
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'technologies') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols && cols.includes('prerequisites')) {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: BLUE_TECH, error: null }),
                }),
              }
            }
            // allTechs query (select 'name, technology_type')
            return {
              then: undefined,
              // This is called as: db.from('technologies').select('name, technology_type')
              // then resolved with data directly
              eq: vi.fn().mockResolvedValue({ data: ALL_TECHS, error: null }),
            }
          }),
        }
      }
      return origImpl ? origImpl(table) : {}
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      tech_name: 'Neural Motivator',
    }))
    // With Yin Omar, the 1 missing blue prereq is forgiven → research succeeds
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.researched).toBe(true)
  })

  it('no pending_window when no commander fires', async () => {
    mockDbP43c({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tech: { name: 'Neural Motivator', technology_type: 'green', prerequisites: {}, expansion: 'base' },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      tech_name: 'Neural Motivator',
      bypass_prerequisites: true,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})
