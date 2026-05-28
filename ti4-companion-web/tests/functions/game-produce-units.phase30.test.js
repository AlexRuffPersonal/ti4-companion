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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
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
  { name: 'Carrier', cost: 3, production: null, unit_type: 'ship' },
  { name: 'Space Dock', cost: null, production: '3', unit_type: 'structure' },
  { name: 'Infantry', cost: 0.5, production: null, unit_type: 'ground' },
  { name: 'Mech', cost: 2, production: null, unit_type: 'ground' },
]

/**
 * Comprehensive mockDb that supports all the new Phase 30 queries.
 * game_player_units dispatches on the SELECT column string to differentiate:
 *   'unit_type, count' => caller units in system (for capacity)
 *   'id'              => enemy units check (neq + limit pattern)
 *   'on_planet, unit_type' => Aerie Hololattice structures query
 *   'id, count'       => existing unit upsert check (production loop + yin/sar)
 *                        — also handles war sun check for Magmus (returns via eq chain)
 *
 * game_players has both select (maybeSingle) and update paths.
 */
function mockDb({
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
  existingInfantry = null,
  existingMech = null,
} = {}) {
  // Track calls for assertions
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
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
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
      // AI Dev Algo upgrade count query: .in('name', heldTechs).eq('technology_type', 'unit_upgrade')
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
            // Caller units in system (capacity)
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: callerUnits, error: null }),
                }),
              }),
            }
          }
          if (cols === 'id') {
            // Enemy units check (neq pattern) OR war sun check OR Magmus (eq chain)
            // Both patterns end with limit() or eq() returning data arrays
            const eqChain = {
              eq: vi.fn(),
              neq: vi.fn(),
              limit: vi.fn(),
            }
            eqChain.eq.mockReturnValue(eqChain)
            eqChain.neq.mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
            })
            // For Magmus war sun query (all eq chain, no neq)
            eqChain.limit.mockResolvedValue({ data: enemyUnits, error: null })
            // The war sun query ends with .eq('unit_type', 'war sun') — last eq resolves
            // We need the last eq in the chain to resolve as warSuns
            // Override: track call count to differentiate enemy vs war sun
            let eqCallCount = 0
            eqChain.eq.mockImplementation(() => {
              eqCallCount++
              if (eqCallCount >= 3) {
                // This is likely the war sun check (4th eq total incl. initial)
                return {
                  eq: vi.fn().mockResolvedValue({ data: warSuns, error: null }),
                  limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                  neq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
                  }),
                }
              }
              return eqChain
            })
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
            // Aerie Hololattice structures query
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
          // 'id, count' — existing unit upsert checks (production loop, yin spinner, self-assembly)
          // We differentiate yin spinner (infantry) and self-assembly (mech) by returning appropriate data
          // For simplicity: track call sequence or just return existingUnit for production, then
          // use separate mocks for yin/sar by overriding with mockImplementationOnce in tests.
          let idCountCallCount = 0
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
    return {}
  })

  return calls
}

describe('game-produce-units Phase 30 tech effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  // ── Sarween Tools ──────────────────────────────────────────────────────────
  it('Sarween Tools reduces effective cost by 1 (allowing production with 1 fewer resource)', async () => {
    // Carrier costs 3. Planet has 2 resources. Without Sarween would fail; with it effectiveCost=2.
    mockDb({
      player: { id: PLAYER_ID, technologies: ['Sarween Tools'], exhausted_technologies: [], trade_goods: 0 },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 2 }] },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('without Sarween Tools, insufficient resources returns 409', async () => {
    mockDb({
      player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [], trade_goods: 0 },
      tile: { planets: [{ name: 'Mecatol Rex', resources: 2 }] },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  // ── AI Development Algorithm ───────────────────────────────────────────────
  it('AI Dev Algo (exhausted) reduces effective cost by upgradeCount', async () => {
    // Carrier costs 3. Resources = 1. AIDA exhausted, 2 unit_upgrade techs => effectiveCost = 1 => success
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.produced).toBe(true)
  })

  it('AI Dev Algo NOT exhausted does not reduce cost', async () => {
    // AIDA held but not exhausted => no reduction. Carrier costs 3, resources=1 => 409
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(409)
  })

  // ── Yin Spinner ────────────────────────────────────────────────────────────
  it('Yin Spinner inserts infantry on yin_spinner_planet after production', async () => {
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
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
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const infantryInsert = insertCalls.find(c => c.unit_type === 'infantry')
    expect(infantryInsert).toBeUndefined()
  })

  // ── Self-Assembly Routines ────────────────────────────────────────────────
  it('Self-Assembly Routines places mech and exhausts tech when self_assembly_exhaust=true', async () => {
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
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
    mockDb({
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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
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
    mockDb({ player: playerData, warSuns: [{ id: 'war-sun-1' }] })

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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
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
    mockDb({ player: playerData, warSuns: [] })

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
      game_id: GAME_ID,
      system_key: SYSTEM_KEY,
      units: [{ unit_type: 'Carrier', count: 1 }],
      planet_exhausts: ['Mecatol Rex'],
    }))
    expect(res.status).toBe(200)
    const tgUpdate = gpUpdateCalls.find(c => typeof c.trade_goods === 'number')
    expect(tgUpdate).toBeUndefined()
  })
})
