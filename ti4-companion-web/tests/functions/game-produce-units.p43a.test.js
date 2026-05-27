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
  AGENT_REACTIVE_TRIGGERS: {
    'The Winnu': ['PRODUCTION'],
    'The Ghosts Of Creuss': ['SYSTEM_ACTIVATED'],
  },
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-produce-units/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const WINNU_PLAYER_ID = 'winnu-player-uuid'
const SYSTEM_KEY = '1,2'
const AGENT_ID = 'winnu-agent-uuid'

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

const ALL_UNIT_DEFS = [
  { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
  { name: 'space dock', cost: null, production: '3', unit_type: 'structure' },
]

function mockDb({
  player = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 10 },
  game = DEFAULT_GAME,
  activation = { id: 'act-uuid' },
  tile = { planets: [{ name: 'Mecatol Rex', resources: 10 }] },
  callerUnits = [{ unit_type: 'space dock', count: 1 }],
  ownedPlanets = [{ planet_name: 'Mecatol Rex' }],
  enemyUnits = [],
  otherPlayers = [],
  agentLeader = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          // Reactive agent check: fetches id, faction, leaders for all players in game
          if (cols === 'id, faction, leaders') {
            return {
              eq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }),
            }
          }
          // Original player fetch: id, technologies, exhausted_technologies, trade_goods
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS, error: null }),
        }),
      }
    }
    if (table === 'technologies') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols === 'unit_type, count') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: callerUnits, error: null }),
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                }),
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: agentLeader, error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-produce-units Phase 43a — reactive agent window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  })

  it('includes pending_window when Winnu agent is unlocked and PRODUCTION trigger matches', async () => {
    mockDb({
      otherPlayers: [
        { id: WINNU_PLAYER_ID, faction: 'The Winnu', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toHaveLength(1)
    expect(body.pending_window.eligible[0].player_id).toBe(WINNU_PLAYER_ID)
    expect(body.pending_window.eligible[0].faction).toBe('The Winnu')
    expect(body.pending_window.eligible[0].agent_id).toBe(AGENT_ID)
    expect(body.pending_window.context.trigger).toBe('PRODUCTION')
    expect(body.pending_window.context.system_key).toBe(SYSTEM_KEY)
  })

  it('does not include pending_window when no other players have unlocked reactive agents', async () => {
    mockDb({
      otherPlayers: [
        { id: 'other-player-uuid', faction: 'The Nekro Virus', leaders: { agent: 'exhausted' } },
      ],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('does not include pending_window when Winnu agent is unlocked but faction has no PRODUCTION trigger', async () => {
    // Ghosts of Creuss agent is unlocked but only reacts to SYSTEM_ACTIVATED, not PRODUCTION
    mockDb({
      otherPlayers: [
        { id: 'creuss-player-uuid', faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: 'creuss-agent-uuid' },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('does not include pending_window when no other players exist', async () => {
    mockDb({ otherPlayers: [] })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('reactive agent window takes precedence over commander passive pending_window', async () => {
    // When both a commander passive pending_window AND reactive agent exist,
    // the reactive agent window should be returned
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'PRODUCTION',
        faction: 'The Titans Of Ul',
        player_id: PLAYER_ID,
        effect: [{ op: 'gain_trade_goods', amount: 1 }],
      }],
    })
    mockDb({
      otherPlayers: [
        { id: WINNU_PLAYER_ID, faction: 'The Winnu', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
  })
})
