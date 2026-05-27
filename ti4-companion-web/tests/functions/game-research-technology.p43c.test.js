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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
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

// Tech with 1 blue prerequisite
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

function mockDb({
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
            // resolve directly for SELECT * FROM technologies
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

describe('game-research-technology Phase 43c — commander passives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with TECH_RESEARCHED trigger', async () => {
    mockDb({
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
    mockDb({
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
    mockDb({
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
    mockDb({
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
