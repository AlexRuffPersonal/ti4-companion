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

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertProductionAllowed: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error {
    constructor(msg, status = 409) { super(msg); this.name = 'LawError'; this.status = status }
  },
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { assertProductionAllowed, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-produce-units/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-produce-units', body)

const SYSTEM_KEY = '1,2'

const DEFAULT_GAME = {
  id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID, round: 1,
  map_tiles: { [SYSTEM_KEY]: { tile_id: 'tile-uuid' } },
}

// Space Dock in system provides production=3; Carrier is being produced at cost=3
const ALL_UNIT_DEFS = [
  { name: 'Carrier', cost: 3, production: null, unit_type: 'ship' },
  { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
  { name: 'Infantry', cost: 0.5, production: null, unit_type: 'ground' },
]

const WARFARE_PLAY_ID = 'warfare-play-uuid'

function mockDb({
  player = { id: PLAYER_ID },
  game = DEFAULT_GAME,
  activation = { id: 'act-uuid' },
  tile = { planets: [{ name: 'Mecatol Rex', resources: 3 }] },
  callerUnits = [{ unit_type: 'Space Dock', count: 1 }],
  ownedPlanets = [{ planet_name: 'Mecatol Rex' }],
  enemyUnits = [],
  existingUnit = null,
  warfarePlay = { id: WARFARE_PLAY_ID },
  warfareResponse = { id: 'response-uuid' },
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
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: warfarePlay, error: null }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: warfareResponse, error: null }),
              }),
            }),
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
          // 'id, count' — existing unit check in production loop
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
    return nullSafeChain()
  })
}

describe('game-produce-units', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when units is missing or empty', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when not the active player', async () => {
    mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when system not activated', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when no production-capable units in system', async () => {
    mockDb({ callerUnits: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, units: [{ unit_type: 'Carrier', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when exceeds production capacity', async () => {
    // Space Dock capacity=3, requesting 4 units
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 4 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when insufficient resources', async () => {
    // Carrier costs 3 but planet only has 1 resource
    mockDb({ tile: { planets: [{ name: 'Mecatol Rex', resources: 1 }] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when cannot produce ships in enemy-occupied system', async () => {
    mockDb({ enemyUnits: [{ id: 'enemy-unit' }] })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when ground force missing on_planet', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Infantry', count: 1 }],
      planet_exhausts: [],
    }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with produced=true on valid production (new unit row)', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  describe('warfare_secondary path', () => {
    const warfareBody = {
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
      warfare_secondary: true,
    }

    it('returns 200 when warfare_secondary=true with valid play and used response', async () => {
      mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other-player' } })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.produced).toBe(true)
    })

    it('returns 409 when warfare_secondary=true but no active Warfare play', async () => {
      mockDb({ warfarePlay: null })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/No active Warfare play/)
    })

    it('returns 409 when warfare_secondary=true but player has no used response', async () => {
      mockDb({ warfareResponse: null })
      const res = await handler(makeRequest(warfareBody))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Warfare secondary not used/)
    })

    it('returns 409 for active_player check when warfare_secondary=false (default)', async () => {
      mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other-player' } })
      const res = await handler(makeRequest({ ...warfareBody, warfare_secondary: false }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Not your turn/)
    })
  })

  it('increments count on existing unit row', async () => {
    const existingUnit = { id: 'existing-unit', count: 2 }
    mockDb({ existingUnit })
    let updateArgs = null
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        const updateMock = vi.fn().mockImplementation((args) => {
          updateArgs = args
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return { ...obj, update: updateMock }
      }
      return obj
    })
    await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(updateArgs).toEqual({ count: 3 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('phase 30 — tech effects', () => {
  const ALL_UNIT_DEFS_P30 = [
    { name: 'Carrier', cost: 3, production: null, unit_type: 'ship' },
    { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
    { name: 'Infantry', cost: 0.5, production: null, unit_type: 'ground' },
    { name: 'Mech', cost: 2, production: null, unit_type: 'ground' },
  ]

  function mockDbP30({
    player = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
    game = DEFAULT_GAME,
    activation = { id: 'act-uuid' },
    tile = { planets: [{ name: 'Mecatol Rex', resources: 5 }] },
    callerUnits = [{ unit_type: 'Space Dock', count: 1 }],
    ownedPlanets = [{ planet_name: 'Mecatol Rex' }],
    enemyUnits = [],
    existingUnit = null,
    upgradeTechs = [],
    warSuns = [],
    structureUnits = [],
  } = {}) {
    const calls = {
      gamePlayersUpdate: [],
      gamePlayerUnitsInsert: [],
      gamePlayerUnitsUpdate: [],
    }

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
          update: vi.fn().mockImplementation((args) => {
            calls.gamePlayersUpdate.push(args)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
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
            in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS_P30, error: null }),
          }),
        }
      }
      if (table === 'technologies') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: upgradeTechs, error: null }),
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
            if (cols === 'id') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                    }),
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockResolvedValue({ data: warSuns, error: null }),
                    }),
                  }),
                }),
              }
            }
            if (cols === 'on_planet, unit_type') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      in: vi.fn().mockResolvedValue({ data: structureUnits, error: null }),
                    }),
                  }),
                }),
              }
            }
            const makeIdCountChain = (returnData) => ({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      is: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
                      }),
                      eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
                      }),
                      maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
                    }),
                  }),
                }),
              }),
            })
            return makeIdCountChain(existingUnit)
          }),
          update: vi.fn().mockImplementation((args) => {
            calls.gamePlayerUnitsUpdate.push(args)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
          insert: vi.fn().mockImplementation((args) => {
            calls.gamePlayerUnitsInsert.push(args)
            return Promise.resolve({ error: null })
          }),
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
      return nullSafeChain()
    })

    return calls
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  // ── Sarween Tools ──────────────────────────────────────────────────────────
  it('Sarween Tools reduces effective cost by 1 (allowing production with 1 fewer resource)', async () => {
    mockDbP30({
      player: { id: PLAYER_ID, technologies: ['Sarween Tools'], exhausted_technologies: [], trade_goods: 0 },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 2 }] },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('without Sarween Tools, insufficient resources returns 409', async () => {
    mockDbP30({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 2 }] },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  // ── AI Development Algorithm ───────────────────────────────────────────────
  it('AI Dev Algo (exhausted) reduces effective cost by upgradeCount', async () => {
    mockDbP30({
      player: {
        id: PLAYER_ID,
        technologies: ['AI Development Algorithm', 'Sarfen Siphons', 'Crimson Legionnaire II'],
        exhausted_technologies: ['AI Development Algorithm'],
        trade_goods: 0,
      },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 1 }] },
      upgradeTechs: [{ name: 'Sarfen Siphons' }, { name: 'Crimson Legionnaire II' }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('AI Dev Algo NOT exhausted does not reduce cost', async () => {
    mockDbP30({
      player: {
        id: PLAYER_ID,
        technologies: ['AI Development Algorithm', 'Sarfen Siphons', 'Crimson Legionnaire II'],
        exhausted_technologies: [],
        trade_goods: 0,
      },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 1 }] },
      upgradeTechs: [{ name: 'Sarfen Siphons' }, { name: 'Crimson Legionnaire II' }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  // ── Yin Spinner ────────────────────────────────────────────────────────────
  it('Yin Spinner inserts infantry on yin_spinner_planet after production', async () => {
    mockDbP30({
      player: { id: PLAYER_ID, technologies: ['Yin Spinner'], exhausted_technologies: [], trade_goods: 0 },
    })
    const insertCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        return {
          ...obj,
          insert: vi.fn().mockImplementation((args) => {
            insertCalls.push(args)
            return Promise.resolve({ error: null })
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
      selections: { yin_spinner_planet: 'Mecatol Rex' },
    }))
    expect(res.status).toBe(200)
    const infantryInsert = insertCalls.find(c => c.unit_type === 'infantry')
    expect(infantryInsert).toBeDefined()
    expect(infantryInsert.on_planet).toBe('Mecatol Rex')
    expect(infantryInsert.count).toBe(1)
  })

  it('Yin Spinner does nothing when yin_spinner_planet is not provided', async () => {
    mockDbP30({
      player: { id: PLAYER_ID, technologies: ['Yin Spinner'], exhausted_technologies: [], trade_goods: 0 },
    })
    const insertCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        return {
          ...obj,
          insert: vi.fn().mockImplementation((args) => {
            insertCalls.push(args)
            return Promise.resolve({ error: null })
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const infantryInsert = insertCalls.find(c => c.unit_type === 'infantry')
    expect(infantryInsert).toBeUndefined()
  })

  // ── Self-Assembly Routines ────────────────────────────────────────────────
  it('Self-Assembly Routines places mech and exhausts tech when self_assembly_exhaust=true', async () => {
    mockDbP30({
      player: { id: PLAYER_ID, technologies: ['Self-Assembly Routines'], exhausted_technologies: [], trade_goods: 0 },
    })
    const insertCalls = []
    const gpUpdateCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        return {
          ...obj,
          insert: vi.fn().mockImplementation((args) => {
            insertCalls.push(args)
            return Promise.resolve({ error: null })
          }),
        }
      }
      if (table === 'game_players') {
        return {
          ...obj,
          update: vi.fn().mockImplementation((args) => {
            gpUpdateCalls.push(args)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
      selections: {
        self_assembly_exhaust: true,
        self_assembly_planet: 'Mecatol Rex',
      },
    }))
    expect(res.status).toBe(200)
    const mechInsert = insertCalls.find(c => c.unit_type === 'mech')
    expect(mechInsert).toBeDefined()
    expect(mechInsert.on_planet).toBe('Mecatol Rex')
    const exhaustUpdate = gpUpdateCalls.find(c => c.exhausted_technologies)
    expect(exhaustUpdate).toBeDefined()
    expect(exhaustUpdate.exhausted_technologies).toContain('Self-Assembly Routines')
  })

  it('Self-Assembly Routines does not trigger when already exhausted', async () => {
    mockDbP30({
      player: {
        id: PLAYER_ID,
        technologies: ['Self-Assembly Routines'],
        exhausted_technologies: ['Self-Assembly Routines'],
        trade_goods: 0,
      },
    })
    const insertCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_player_units') {
        return {
          ...obj,
          insert: vi.fn().mockImplementation((args) => {
            insertCalls.push(args)
            return Promise.resolve({ error: null })
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
      selections: {
        self_assembly_exhaust: true,
        self_assembly_planet: 'Mecatol Rex',
      },
    }))
    expect(res.status).toBe(200)
    const mechInsert = insertCalls.find(c => c.unit_type === 'mech')
    expect(mechInsert).toBeUndefined()
  })

  // ── Magmus Reactor ────────────────────────────────────────────────────────
  it('Magmus Reactor grants +1 TG when war sun is present in system', async () => {
    const playerData = { id: PLAYER_ID, technologies: ['Magmus Reactor'], exhausted_technologies: [], trade_goods: 3 }
    mockDbP30({ player: playerData, warSuns: [{ id: 'war-sun-1' }] })

    const gpUpdateCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_players') {
        return {
          ...obj,
          update: vi.fn().mockImplementation((args) => {
            gpUpdateCalls.push(args)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const tgUpdate = gpUpdateCalls.find(c => typeof c.trade_goods === 'number')
    expect(tgUpdate).toBeDefined()
    expect(tgUpdate.trade_goods).toBe(4)
  })

  it('Magmus Reactor does not grant TG when no war sun in system', async () => {
    const playerData = { id: PLAYER_ID, technologies: ['Magmus Reactor'], exhausted_technologies: [], trade_goods: 3 }
    mockDbP30({ player: playerData, warSuns: [] })

    const gpUpdateCalls = []
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const obj = origImpl(table)
      if (table === 'game_players') {
        return {
          ...obj,
          update: vi.fn().mockImplementation((args) => {
            gpUpdateCalls.push(args)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return obj
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const tgUpdate = gpUpdateCalls.find(c => typeof c.trade_goods === 'number')
    expect(tgUpdate).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('phase 39b — Stymie', () => {
  const HOLDER_ID = 'holder-uuid'
  const NOTE_INSTANCE_ID = 'note-instance-uuid'
  const ADJACENT_KEY = '2,2'

  const ALL_UNIT_DEFS_P39B = [
    { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
    { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
  ]

  const EMPTY_ACTIVE_NOTES = {
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }

  function mockDbP39B({
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
            in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS_P39B, error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols === 'system_key') {
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
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    getActiveNotes.mockResolvedValue(EMPTY_ACTIVE_NOTES)
  })

  it('Stymie in_play, Arborec (owner) produces in system with holder units → 409', async () => {
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }],
    })
    mockDbP39B({ holderUnitsInRange: [{ system_key: SYSTEM_KEY }] })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
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
    mockDbP39B({ holderUnitsInRange: [{ system_key: ADJACENT_KEY }] })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/stymie/i)
  })

  it('Stymie in_play, non-Arborec player produces → no block', async () => {
    getActiveNotes.mockResolvedValue({
      ...EMPTY_ACTIVE_NOTES,
      stymie: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: HOLDER_ID, holderPlayerId: PLAYER_ID }],
    })
    mockDbP39B({ holderUnitsInRange: [{ system_key: SYSTEM_KEY }] })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Stymie not in_play → no block', async () => {
    getActiveNotes.mockResolvedValue(EMPTY_ACTIVE_NOTES)
    mockDbP39B({ holderUnitsInRange: [] })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
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
    mockDbP39B({ holderUnitsInRange: [] })

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

// ─────────────────────────────────────────────────────────────────────────────

describe('phase 40 — Law Enforcement', () => {
  const ALL_UNIT_DEFS_P40 = [
    { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
    { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
    { name: 'infantry', cost: 0.5, production: null, unit_type: 'ground' },
    { name: 'pds', cost: 2, production: null, unit_type: 'structure' },
  ]

  function mockDbP40({
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
            in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS_P40, error: null }),
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
            if (cols === 'system_key') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbP40()
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

// ─────────────────────────────────────────────────────────────────────────────

describe('phase 43a — reactive agent window', () => {
  const WINNU_PLAYER_ID = 'winnu-player-uuid'
  const AGENT_ID = 'winnu-agent-uuid'

  const ALL_UNIT_DEFS_P43A = [
    { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
    { name: 'space dock', cost: null, production: '3', unit_type: 'structure' },
  ]

  function mockDbP43A({
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
            if (cols === 'id, faction, leaders') {
              return { eq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }) }
            }
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
            in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS_P43A, error: null }),
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
            if (cols === 'system_key') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  })

  it('includes pending_window when Winnu agent is unlocked and PRODUCTION trigger matches', async () => {
    mockDbP43A({
      otherPlayers: [
        { id: WINNU_PLAYER_ID, faction: 'The Winnu', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
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
    mockDbP43A({
      otherPlayers: [
        { id: 'other-player-uuid', faction: 'The Nekro Virus', leaders: { agent: 'exhausted' } },
      ],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('does not include pending_window when Winnu agent is unlocked but faction has no PRODUCTION trigger', async () => {
    mockDbP43A({
      otherPlayers: [
        { id: 'creuss-player-uuid', faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: 'creuss-agent-uuid' },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('does not include pending_window when no other players exist', async () => {
    mockDbP43A({ otherPlayers: [] })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('reactive agent window takes precedence over commander passive pending_window', async () => {
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
    mockDbP43A({
      otherPlayers: [
        { id: WINNU_PLAYER_ID, faction: 'The Winnu', leaders: { agent: 'unlocked' } },
      ],
      agentLeader: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('phase 43c — commander passives', () => {
  const ALL_UNIT_DEFS_P43C = [
    { name: 'carrier', cost: 3, production: null, unit_type: 'ship' },
    { name: 'flagship', cost: 8, production: null, unit_type: 'ship' },
    { name: 'fighter', cost: 0.5, production: null, unit_type: 'ship' },
    { name: 'infantry', cost: 0.5, production: null, unit_type: 'ground' },
    { name: 'space dock', cost: null, production: '3', unit_type: 'structure' },
  ]

  function mockDbP43C({
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
            in: vi.fn().mockResolvedValue({ data: ALL_UNIT_DEFS_P43C, error: null }),
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
            if (cols === 'system_key') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with PRODUCTION trigger', async () => {
    mockDbP43C()
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
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
    mockDbP43C({ callerUnits: [{ unit_type: 'space dock', count: 1 }] })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: "The Vuil'raith Cabal", effect: 'vuil_production_limit_bypass' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.freeFromLimitCount = (ctx.freeFromLimitCount ?? 0) + 2
    }))
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'fighter', count: 5 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    // capacity=3, freeFromLimit=2, total=5, adjusted=3 => 3 <= 3 => success
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Nomad commander — flagship produced with 0 resources', async () => {
    mockDbP43C({
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
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'flagship', count: 1 }],
      planet_exhausts: [],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('Titans commander — pending_window emitted in response', async () => {
    mockDbP43C()
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
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Titans Of Ul')
  })

  it('no pending_window when no commander fires', async () => {
    mockDbP43C()
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY,
      units: [{ unit_type: 'carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})
