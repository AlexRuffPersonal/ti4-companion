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
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
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

const ALL_UNIT_DEFS = [
  { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
  { name: 'flagship', cost: 8, production: null, unit_type: 'ship' },
  { name: 'fighter', cost: 0.5, production: null, unit_type: 'ship' },
  { name: 'infantry', cost: 0.5, production: null, unit_type: 'ground' },
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
          // id, count — existing unit check and id — enemy check
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
    return {}
  })
}

describe('game-produce-units Phase 43c — commander passives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with PRODUCTION trigger', async () => {
    mockDb()
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'PRODUCTION',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID }),
      expect.anything(),
    )
  })

  it("Vuil'raith commander — production limit bypass allows 2 extra units", async () => {
    mockDb({
      callerUnits: [{ unit_type: 'space dock', count: 1 }],
      // space dock gives 3 capacity; we'll order 5 fighters (3 + 2 bypass)
    })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: "The Vuil'raith Cabal", effect: 'vuil_production_limit_bypass' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.freeFromLimitCount = (ctx.freeFromLimitCount ?? 0) + 2
    }))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'fighter', count: 5 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    // capacity=3, freeFromLimit=2, total=5, adjusted=3 => 3 <= 3 => success
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Nomad commander — flagship produced with 0 resources', async () => {
    mockDb({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 0 }] },
    })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Nomad', effect: 'nomad_free_flagship' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.flagshipCostOverride = 0
    }))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'flagship', count: 1 }],
      planet_exhausts: [],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Titans commander — pending_window emitted in response', async () => {
    mockDb()
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
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Titans Of Ul')
  })

  it('no pending_window when no commander fires', async () => {
    mockDb()
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
})
