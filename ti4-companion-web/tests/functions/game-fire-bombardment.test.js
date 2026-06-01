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
import { handler } from '../../../supabase/functions/game-fire-bombardment/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID, SYSTEM_KEY } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-fire-bombardment', body)

const DEFENDER_ID = 'player-2'
const PLANET_NAME = 'Mecatol Rex'
const TILE_ID = 18

const BASE_BODY = { game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME }

const BASE_GAME = {
  round: 2,
  map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } },
}

const BASE_TILE = {
  planets: [{ name: PLANET_NAME }],
}

const BASE_DEFENDER_UNITS = [
  { id: 'u-def', player_id: DEFENDER_ID, unit_type: 'infantry', count: 2, system_key: SYSTEM_KEY },
]

const BASE_ATK_SPACE_UNITS = [
  { id: 'u-atk', player_id: PLAYER_ID, unit_type: 'dreadnought', count: 2, system_key: SYSTEM_KEY },
]

const BASE_BOMB_DEFS = [
  { name: 'dreadnought', bombardment: '5' },
]

/**
 * mockDb wires up all db.from calls for the happy-path (no planetary shield).
 */
function mockDb({
  player = { id: PLAYER_ID },
  game = BASE_GAME,
  activation = { id: 'act-1' },
  tile = BASE_TILE,
  existingBombardment = null,
  defenderUnits = BASE_DEFENDER_UNITS,
  shieldDefs = [],
  atkSpaceUnits = BASE_ATK_SPACE_UNITS,
  bombDefs = BASE_BOMB_DEFS,
  insertedCombat = { id: 'combat-new' },
  insertError = null,
  commanderPlayers = [],
} = {}) {
  let gpuCallCount = 0
  let unitsCallCount = 0
  let gcCallCount = 0
  let gpCallCount = 0

  buildDbMock(db, {
    game_players: () => {
      gpCallCount++
      if (gpCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
              }),
            }),
          }),
        }
      } else {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: commanderPlayers }),
          }),
        }
      }
    },
    games: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game }),
        }),
      }),
    }),
    game_system_activations: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: activation }),
              }),
            }),
          }),
        }),
      }),
    }),
    tiles: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: tile }),
        }),
      }),
    }),
    game_combats: () => {
      gcCallCount++
      if (gcCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingBombardment }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedCombat, error: insertError }),
          }),
        }),
      }
    },
    game_player_units: () => {
      gpuCallCount++
      const data = gpuCallCount === 1 ? defenderUnits : atkSpaceUnits
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data }),
                eq: vi.fn().mockResolvedValue({ data }),
                is: vi.fn().mockResolvedValue({ data }),
              }),
            }),
          }),
        }),
      }
    },
    units: () => {
      unitsCallCount++
      const data = unitsCallCount === 1 ? shieldDefs : bombDefs
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data }),
            not: vi.fn().mockResolvedValue({ data }),
          }),
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data }),
          }),
        }),
      }
    },
  })
}

/**
 * Full mock for scenarios with planetary shield active.
 */
function mockDbWithShield({
  player = { id: PLAYER_ID },
  game = BASE_GAME,
  activation = { id: 'act-1' },
  tile = BASE_TILE,
  existingBombardment = null,
  defenderUnits = BASE_DEFENDER_UNITS,
  shieldDefs = [{ name: 'pds' }],
  atkSpaceUnitsForShield = BASE_ATK_SPACE_UNITS,
  warSunDefs = [],
  atkSpaceUnits = BASE_ATK_SPACE_UNITS,
  bombDefs = BASE_BOMB_DEFS,
  insertedCombat = { id: 'combat-new' },
  insertError = null,
  commanderPlayers = [],
} = {}) {
  let gpuCallCount = 0
  let unitsCallCount = 0
  let gcCallCount = 0
  let gpCallCount = 0

  buildDbMock(db, {
    game_players: () => {
      gpCallCount++
      if (gpCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
              }),
            }),
          }),
        }
      } else {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: commanderPlayers }),
          }),
        }
      }
    },
    games: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game }),
        }),
      }),
    }),
    game_system_activations: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: activation }),
              }),
            }),
          }),
        }),
      }),
    }),
    tiles: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: tile }),
        }),
      }),
    }),
    game_combats: () => {
      gcCallCount++
      if (gcCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingBombardment }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedCombat, error: insertError }),
          }),
        }),
      }
    },
    game_player_units: () => {
      gpuCallCount++
      let data
      if (gpuCallCount === 1) data = defenderUnits
      else if (gpuCallCount === 2) data = atkSpaceUnitsForShield
      else data = atkSpaceUnits
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data }),
                eq: vi.fn().mockResolvedValue({ data }),
                is: vi.fn().mockResolvedValue({ data }),
              }),
            }),
          }),
        }),
      }
    },
    units: () => {
      unitsCallCount++
      let data
      if (unitsCallCount === 1) data = shieldDefs
      else if (unitsCallCount === 2) data = warSunDefs
      else data = bombDefs
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data }),
            not: vi.fn().mockResolvedValue({ data }),
          }),
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data }),
          }),
        }),
      }
    },
  })
}

describe('game-fire-bombardment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ system_key: SYSTEM_KEY, planet_name: PLANET_NAME }))
    expect(res.status).toBe(400)
  })

  it('400 missing system_key', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, planet_name: PLANET_NAME }))
    expect(res.status).toBe(400)
  })

  it('400 missing planet_name', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY }))
    expect(res.status).toBe(400)
  })

  it('404 player not found in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(404)
  })

  it('409 system not activated by caller', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not activated/i)
  })

  it('409 planet not found in system', async () => {
    mockDb({ tile: { planets: [{ name: 'Other Planet' }] } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/planet not found in system/i)
  })

  it('409 planet already bombarded this invasion', async () => {
    mockDb({ existingBombardment: { id: 'existing-combat' } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already bombarded/i)
  })

  it('409 no ground forces to bombard on this planet', async () => {
    mockDb({ defenderUnits: [] })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no ground forces/i)
  })

  it('409 planetary shield is active — no war sun', async () => {
    mockDbWithShield({
      shieldDefs: [{ name: 'pds' }],
      warSunDefs: [],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/planetary shield/i)
  })

  it('409 no bombardment units in space area', async () => {
    mockDb({ bombDefs: [] })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/bombardment ability/i)
  })

  it('200 GIVEN 2 dreadnoughts (bombardment 5), 1 hit → phase bombardment_assign', async () => {
    let capturedInsertMock
    let gpuCallCount = 0
    let unitsCallCount = 0
    let gcCallCount = 0

    buildDbMock(db, {
      game_players: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
            }),
          }),
        }),
      }),
      games: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME }),
          }),
        }),
      }),
      game_system_activations: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'act-1' } }),
                }),
              }),
            }),
          }),
        }),
      }),
      tiles: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: BASE_TILE }),
          }),
        }),
      }),
      game_combats: () => {
        gcCallCount++
        if (gcCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        const insertMock = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'combat-new' }, error: null }),
          }),
        })
        capturedInsertMock = insertMock
        return { insert: insertMock }
      },
      game_player_units: () => {
        gpuCallCount++
        const data = gpuCallCount === 1 ? BASE_DEFENDER_UNITS : BASE_ATK_SPACE_UNITS
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data }),
                  eq: vi.fn().mockResolvedValue({ data }),
                  is: vi.fn().mockResolvedValue({ data }),
                }),
              }),
            }),
          }),
        }
      },
      units: () => {
        unitsCallCount++
        const data = unitsCallCount === 1 ? [] : BASE_BOMB_DEFS
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data }),
              not: vi.fn().mockResolvedValue({ data }),
            }),
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data }),
            }),
          }),
        }
      },
    })

    // 2 dreadnoughts × 1 die each = 2 dice, bombardment '5' means hit on >= 5
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValueOnce(0.7).mockReturnValueOnce(0.2)

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.hits).toBe(1)
    expect(body.combat_id).toBe('combat-new')
    expect(body.dice).toHaveLength(2)

    expect(capturedInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      combat_type: 'bombardment',
      planet_name: PLANET_NAME,
      attacker_hits: 1,
      phase: 'bombardment_assign',
    }))

    randomSpy.mockRestore()
  })

  it('200 GIVEN rolls all miss → phase complete', async () => {
    let capturedInsertMock
    let gpuCallCount = 0
    let unitsCallCount = 0
    let gcCallCount = 0

    buildDbMock(db, {
      game_players: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
            }),
          }),
        }),
      }),
      games: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME }),
          }),
        }),
      }),
      game_system_activations: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'act-1' } }),
                }),
              }),
            }),
          }),
        }),
      }),
      tiles: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: BASE_TILE }),
          }),
        }),
      }),
      game_combats: () => {
        gcCallCount++
        if (gcCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        const insertMock = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'combat-new' }, error: null }),
          }),
        })
        capturedInsertMock = insertMock
        return { insert: insertMock }
      },
      game_player_units: () => {
        gpuCallCount++
        const data = gpuCallCount === 1 ? BASE_DEFENDER_UNITS : BASE_ATK_SPACE_UNITS
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data }),
                  eq: vi.fn().mockResolvedValue({ data }),
                  is: vi.fn().mockResolvedValue({ data }),
                }),
              }),
            }),
          }),
        }
      },
      units: () => {
        unitsCallCount++
        const data = unitsCallCount === 1 ? [] : BASE_BOMB_DEFS
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data }),
              not: vi.fn().mockResolvedValue({ data }),
            }),
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data }),
            }),
          }),
        }
      },
    })

    // Both dreadnoughts miss (Math.ceil(0.3 * 10) = 3 < 5)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.3)

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.hits).toBe(0)
    expect(capturedInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'complete',
      attacker_hits: 0,
    }))

    randomSpy.mockRestore()
  })

  it('200 GIVEN planetary shield present AND attacker has war sun → shield check passes', async () => {
    const atkWithWarSun = [
      { id: 'u-ws', player_id: PLAYER_ID, unit_type: 'war_sun', count: 1, system_key: SYSTEM_KEY },
    ]
    const warSunBombDefs = [{ name: 'war_sun', bombardment: '3(x3)' }]

    mockDbWithShield({
      shieldDefs: [{ name: 'pds' }],
      atkSpaceUnitsForShield: atkWithWarSun,
      warSunDefs: [{ name: 'war_sun' }],
      atkSpaceUnits: atkWithWarSun,
      bombDefs: warSunBombDefs,
      insertedCombat: { id: 'combat-ws' },
    })

    // 1 war_sun × 3 dice (bombardment '3(x3)'), all hit (Math.ceil(0.4 * 10) = 4 >= 3)
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.4)

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.combat_id).toBe('combat-ws')
    expect(body.hits).toBe(3) // 3 dice all hit

    randomSpy.mockRestore()
  })
})

// Phase 43c tests: Commander Passives

describe('game-fire-bombardment Phase 43c — L1Z1X commander: skip planetary shield', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('L1Z1X commander unlocked — bombardment proceeds despite Planetary Shield (no 409)', async () => {
    const l1z1xPlayer = {
      id: PLAYER_ID,
      faction: 'The L1Z1X Mindnet',
      leaders: { commander: 'unlocked' },
    }

    // Shield is present but L1Z1X commander unlocked — should skip shield check
    mockDbWithShield({
      shieldDefs: [{ name: 'pds' }],
      warSunDefs: [],
      commanderPlayers: [l1z1xPlayer],
    })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.3) // miss

    const res = await handler(makeRequest(BASE_BODY))
    // Should NOT return 409 — L1Z1X commander bypasses planetary shield
    expect(res.status).toBe(200)

    randomSpy.mockRestore()
  })

  it('no commander unlocked — planetary shield still blocks bombardment (409)', async () => {
    mockDbWithShield({
      shieldDefs: [{ name: 'pds' }],
      warSunDefs: [],
      commanderPlayers: [], // no commanders unlocked
    })

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/planetary shield/i)
  })
})

describe('game-fire-bombardment Phase 43c — Argent Flight commander: extra die on bombardment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('Argent Flight commander unlocked — pending_window for add_die included in response', async () => {
    const argentPlayer = {
      id: PLAYER_ID,
      faction: 'The Argent Flight',
      leaders: { commander: 'unlocked' },
    }

    mockDb({ commanderPlayers: [argentPlayer] })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.3) // miss

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Argent Flight')
    expect(body.pending_window.trigger).toBe('UNIT_ABILITY_ROLL')
    expect(body.pending_window.effect).toEqual([{ op: 'add_die', target: 'chosen_unit' }])

    randomSpy.mockRestore()
  })

  it('no commanders unlocked — no pending_window in response', async () => {
    mockDb({ commanderPlayers: [] })

    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0.3)

    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()

    randomSpy.mockRestore()
  })
})
