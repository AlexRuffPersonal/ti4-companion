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
  AGENT_REACTIVE_TRIGGERS: {},
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertProductionAllowed: vi.fn(),
  LawError: class LawError extends Error {
    constructor(msg, status = 409) { super(msg); this.name = 'LawError'; this.status = status }
  },
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { assertProductionAllowed, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
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
  { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
  { name: 'infantry', cost: 0.5, production: null, unit_type: 'ground' },
  { name: 'pds', cost: 2, production: null, unit_type: 'structure' },
]

function mockDb({
  player = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
  game = DEFAULT_GAME,
  activation = { id: 'act-uuid' },
  tile = { planets: [{ name: 'Mecatol Rex', resources: 6 }] },
  callerUnits = [{ unit_type: 'Space Dock', count: 1 }],
  ownedPlanets = [{ planet_name: 'Mecatol Rex' }],
  enemyUnits = [],
  existingUnit = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols === 'id, faction, leaders') {
            return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
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
          if (cols === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                  }),
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
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

describe('game-produce-units Phase 40 — Law Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    assertProductionAllowed.mockResolvedValue(undefined)
  })

  it('returns 409 when Regulated Conscription is active and producing carrier', async () => {
    assertProductionAllowed.mockRejectedValue(
      new LawError('Regulated Conscription: only infantry may be produced', 409)
    )
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Regulated Conscription/)
  })

  it('returns 200 when Regulated Conscription is active and producing infantry', async () => {
    // assertProductionAllowed resolves for infantry (the law only blocks non-infantry)
    assertProductionAllowed.mockResolvedValue(undefined)
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'infantry', count: 1, on_planet: 'Mecatol Rex' }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('returns 409 when Articles of War is active and producing pds', async () => {
    assertProductionAllowed.mockRejectedValue(
      new LawError('Articles of War: PDS cannot be produced', 409)
    )
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'pds', count: 1, on_planet: 'Mecatol Rex' }],
      planet_exhausts: [],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Articles of War/)
  })

  it('returns 200 with no laws active (assertProductionAllowed resolves for all)', async () => {
    assertProductionAllowed.mockResolvedValue(undefined)
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })
})
