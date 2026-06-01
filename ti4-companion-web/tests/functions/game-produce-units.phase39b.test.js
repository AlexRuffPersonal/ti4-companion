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
  assertProductionAllowed: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error {
    constructor(msg, status = 409) { super(msg); this.name = 'LawError'; this.status = status }
  },
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-produce-units/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const HOLDER_ID = 'holder-uuid'
const SYSTEM_KEY = '1,2'
// Axial neighbors of '1,2': '2,2','0,2','1,3','1,1','2,1','0,3'
const ADJACENT_KEY = '2,2'
const FAR_KEY = '5,5'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

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
  holderUnitsInRange = [],
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
          if (cols === 'system_key') {
            // stymie holder units query
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({ data: holderUnitsInRange, error: null }),
                }),
              }),
            }
          }
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

const EMPTY_ACTIVE_NOTES = {
  supportForThrone: [],
  alliance: [],
  tradeConvoys: [],
  promiseOfProtection: [],
  bloodPact: [],
  darkPact: [],
  stymie: [],
  antivirus: [],
  giftOfPrescience: [],
  tradeAgreement: [],
  crucible: [],
  strikeWingAmbuscade: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  getActiveNotes.mockResolvedValue(EMPTY_ACTIVE_NOTES)
})

describe('game-produce-units Phase 39b — Stymie', () => {
  it('Stymie in_play, Arborec (owner) produces in system with holder units → 409', async () => {
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }],
    })
    mockDb({
      holderUnitsInRange: [{ system_key: SYSTEM_KEY }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/stymie/i)
  })

  it('Stymie in_play, Arborec (owner) produces in system adjacent to holder units → 409', async () => {
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }],
    })
    mockDb({
      // Holder units are in an adjacent system, not the production system itself
      holderUnitsInRange: [{ system_key: ADJACENT_KEY }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/stymie/i)
  })

  it('Stymie in_play, non-Arborec player produces → no block', async () => {
    // HOLDER_ID holds the note; ownerPlayerId is a different player (not our activating player)
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: HOLDER_ID, holderPlayerId: PLAYER_ID }],
    })
    mockDb({
      holderUnitsInRange: [{ system_key: SYSTEM_KEY }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Stymie not in_play → no block', async () => {
    getActiveNotes.mockResolvedValue(EMPTY_ACTIVE_NOTES)
    mockDb({
      holderUnitsInRange: [],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Stymie in_play, Arborec (owner) produces but holder has no units in/adjacent to system → no block', async () => {
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }],
    })
    mockDb({
      holderUnitsInRange: [],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })
})
