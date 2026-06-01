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
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-commit-ground-forces/index.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-commit-ground-forces', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const DEFENDER_ID = 'defender-uuid'
const TILE_ID = 42
const SYSTEM_KEY = '1,-1'
const PLANET_NAME = 'Wellon'

const BASE_BODY = { game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 2 }

const DEFAULT_MAP_TILES = {
  [SYSTEM_KEY]: { tile_id: TILE_ID },
  '0,0': { tile_id: 18 },
}

/**
 * mockDb wires up all db.from calls for the given scenario.
 *
 * Query order (no defenders, no bombardment ships):
 *  1. game_players (select id)       → player
 *  2. games (select round, map_tiles, custodians_claimed) → game
 *  3. game_system_activations        → activation
 *  4. tiles                          → tile
 *  5. game_player_units (atkSpaceUnits, is null)
 *  6. units (bombDefs, .not)
 *  7. game_player_units (defenders, neq)
 *  8. game_player_units (existingInfantry, maybeSingle)
 *  9. game_player_units (insert) OR game_combats (insert)
 * When no defenders → also: game_player_planets.upsert, game_player_legendary_cards (maybeSingle or insert)
 * When custodians: games.update + game_players.select(vp) + game_players.update
 */
function mockDb({
  player = { id: PLAYER_ID },
  game = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
  activation = { id: 'act-1', bombardment_done: false },
  tile = { planets: [{ name: PLANET_NAME }] },
  atkSpaceUnits = [],
  bombDefs = [],
  defenders = [],
  existingInfantry = null,
  scdDefs = [],
  insertedCombat = { id: 'combat-1' },
  legendaryCardExisting = null,
  playerVp = { vp: 3 },
} = {}) {
  let gpuCallCount = 0
  let unitsCallCount = 0

  const unitInsertMock = vi.fn().mockResolvedValue({ error: null })
  const unitUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const planetUpsertMock = vi.fn().mockResolvedValue({ error: null })
  const legendaryInsertMock = vi.fn().mockResolvedValue({ error: null })
  const legendaryUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const combatInsertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: insertedCombat, error: null }),
    }),
  })
  const gamesUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const gamePlayerUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }),
            }
          }
          // vp query
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: playerVp, error: null }),
            }),
          }
        }),
        update: gamePlayerUpdateMock,
      }
    }

    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: gamesUpdateMock,
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

    if (table === 'game_player_units') {
      gpuCallCount++
      // Call 1: atkSpaceUnits (is null on_planet) — resolves via .is()
      // Call 2: defenders (neq player_id) — resolves via .neq() or .eq()
      // Call 3: existingInfantry — resolves via .maybeSingle()
      if (gpuCallCount === 1) {
        // atkSpaceUnits
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: atkSpaceUnits, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (gpuCallCount === 2) {
        // defenders
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: defenders, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (gpuCallCount === 3) {
        // existingInfantry
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: existingInfantry, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: unitInsertMock,
          update: unitUpdateMock,
        }
      }
      // Fallback (insert / update calls after the select)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        insert: unitInsertMock,
        update: unitUpdateMock,
      }
    }

    if (table === 'units') {
      unitsCallCount++
      // Call 1: bombDefs (.not bombardment is null)
      // Call 2: scdDefs (.not space_cannon is null)
      const data = unitsCallCount === 1 ? bombDefs : scdDefs
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }
    }

    if (table === 'game_player_planets') {
      return {
        upsert: planetUpsertMock,
      }
    }

    if (table === 'game_player_legendary_cards') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: legendaryCardExisting, error: null }),
            }),
          }),
        }),
        insert: legendaryInsertMock,
        update: legendaryUpdateMock,
      }
    }

    if (table === 'game_combats') {
      return {
        insert: combatInsertMock,
      }
    }

    return nullSafeChain()
  })

  return { planetUpsertMock, unitInsertMock, unitUpdateMock, combatInsertMock, gamesUpdateMock, legendaryInsertMock, legendaryUpdateMock, gamePlayerUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  getHeldNotes.mockResolvedValue([])
  returnNote.mockResolvedValue(undefined)
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-commit-ground-forces', () => {
  it('TCORS: OPTIONS returns 204', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('T401: unauthenticated request returns 401', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(401)
  })

  it('T400(game_id): missing game_id returns 400', async () => {
    const res = await handler(makeRequest({ system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 1 }))
    expect(res.status).toBe(400)
  })

  it('T400(system_key): missing system_key returns 400', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, planet_name: PLANET_NAME, troop_count: 1 }))
    expect(res.status).toBe(400)
  })

  it('T400(planet_name): missing planet_name returns 400', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, troop_count: 1 }))
    expect(res.status).toBe(400)
  })

  it('T400(troop_count=0): troop_count < 1 returns 400', async () => {
    const res = await handler(makeRequest({ ...BASE_BODY, troop_count: 0 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/troop_count/i)
  })

  it('T404_PLAYER: player not in game returns 404', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(404)
  })

  it('T409_ACTIVATED: system not activated by caller returns 409', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not activated/i)
  })

  it("T409('planet not in tile'): planet not found in tile returns 409", async () => {
    mockDb({ tile: { planets: [{ name: 'OtherPlanet' }] } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/planet not found in system/i)
  })

  it("T409('must resolve bombardment phase'): bombardment_done=false + bombDefs present returns 409", async () => {
    mockDb({
      atkSpaceUnits: [{ id: 'u-1', player_id: PLAYER_ID, unit_type: 'dreadnought', count: 1 }],
      bombDefs: [{ name: 'dreadnought', bombardment: '5' }],
      activation: { id: 'act-1', bombardment_done: false },
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/bombardment phase/i)
  })

  it('GIVEN no defenders, no bombardment ships: claims planet and returns { claimed: true }', async () => {
    const { planetUpsertMock, unitInsertMock } = mockDb({
      atkSpaceUnits: [],
      bombDefs: [],
      defenders: [],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
    expect(body.combat_id).toBeUndefined()
    expect(planetUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: PLANET_NAME, player_id: PLAYER_ID, tile_id: TILE_ID, exhausted: true }),
      { onConflict: 'game_id,planet_name' },
    )
    expect(unitInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ unit_type: 'infantry', on_planet: PLANET_NAME, count: 2, player_id: PLAYER_ID }),
    )
  })

  it('GIVEN defenders present, defender has PDS (space_cannon): inserts combat with phase scd_fire', async () => {
    const { combatInsertMock, planetUpsertMock } = mockDb({
      defenders: [{ id: 'u-def', player_id: DEFENDER_ID, unit_type: 'pds', count: 1 }],
      scdDefs: [{ name: 'pds', space_cannon: '6' }],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.combat_id).toBe('combat-1')
    expect(body.claimed).toBeUndefined()
    expect(combatInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ combat_type: 'ground', phase: 'scd_fire', planet_name: PLANET_NAME }),
    )
    expect(planetUpsertMock).not.toHaveBeenCalled()
  })

  it('GIVEN defenders present, no SCD: inserts combat with phase attacker_roll', async () => {
    const { combatInsertMock } = mockDb({
      defenders: [{ id: 'u-def', player_id: DEFENDER_ID, unit_type: 'infantry', count: 3 }],
      scdDefs: [],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.combat_id).toBe('combat-1')
    expect(combatInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ combat_type: 'ground', phase: 'attacker_roll' }),
    )
  })

  it('GIVEN bombardment_done=true, bombDefs present: proceeds normally (no 409)', async () => {
    const { planetUpsertMock } = mockDb({
      atkSpaceUnits: [{ id: 'u-1', player_id: PLAYER_ID, unit_type: 'dreadnought', count: 1 }],
      bombDefs: [{ name: 'dreadnought', bombardment: '5' }],
      activation: { id: 'act-1', bombardment_done: true },
      defenders: [],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
    expect(planetUpsertMock).toHaveBeenCalled()
  })

  it("GIVEN system_key='0,0', custodians_claimed=false, no defenders: custodians awarded", async () => {
    const mecatolGame = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false }
    const { gamesUpdateMock, gamePlayerUpdateMock } = mockDb({
      game: mecatolGame,
      tile: { planets: [{ name: 'Mecatol Rex' }] },
      defenders: [],
    })
    const res = await handler(
      makeRequest({ game_id: GAME_ID, system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
    expect(body.custodians_claimed).toBe(true)
    expect(gamesUpdateMock).toHaveBeenCalledWith({ custodians_claimed: true, agenda_unlocked: true })
    expect(gamePlayerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ vp: 4 }))
  })

  it("GIVEN no defenders, planet_name='primor': legendary card inserted with status readied", async () => {
    const { legendaryInsertMock } = mockDb({
      tile: { planets: [{ name: 'primor' }] },
      defenders: [],
      legendaryCardExisting: null,
    })
    const res = await handler(
      makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: 'primor', troop_count: 1 }),
    )
    expect(res.status).toBe(200)
    expect(legendaryInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: 'primor', player_id: PLAYER_ID, status: 'readied' }),
    )
  })

  it("GIVEN no defenders, planet_name='mallice': legendary card inserted + wormhole_nexus_active set", async () => {
    const { legendaryInsertMock, gamesUpdateMock } = mockDb({
      tile: { planets: [{ name: 'mallice' }] },
      defenders: [],
      legendaryCardExisting: null,
    })
    const res = await handler(
      makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: 'mallice', troop_count: 1 }),
    )
    expect(res.status).toBe(200)
    expect(legendaryInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: 'mallice', status: 'readied' }),
    )
    expect(gamesUpdateMock).toHaveBeenCalledWith({ wormhole_nexus_active: true })
  })

  it("GIVEN no defenders, planet_name='regular_planet': game_player_legendary_cards NOT touched", async () => {
    const { legendaryInsertMock, legendaryUpdateMock } = mockDb({
      tile: { planets: [{ name: PLANET_NAME }] },
      defenders: [],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    expect(legendaryInsertMock).not.toHaveBeenCalled()
    expect(legendaryUpdateMock).not.toHaveBeenCalled()
  })
})

describe("phase 39b — Ragh's Call promissory note", () => {
  const SAAR_ID = 'saar-uuid'
  const NOTE_ID = 'note-instance-uuid'
  const RETREAT_SYSTEM_KEY = '2,0'
  const RETREAT_PLANET = 'Jord'
  const RETREAT_TILE_ID = 99

  const PHASE39B_MAP_TILES = {
    [SYSTEM_KEY]: { tile_id: TILE_ID },
    [RETREAT_SYSTEM_KEY]: { tile_id: RETREAT_TILE_ID },
  }

  const PHASE39B_BASE_BODY = {
    game_id: GAME_ID,
    system_key: SYSTEM_KEY,
    planet_name: PLANET_NAME,
    troop_count: 2,
    saar_retreat_planet: RETREAT_PLANET,
  }

  function makeUpdateChain() {
    const chain = {}
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.then = (resolve) => resolve({ error: null })
    return chain
  }

  function mockDb39b({
    player = { id: PLAYER_ID },
    game = { round: 1, map_tiles: PHASE39B_MAP_TILES, custodians_claimed: true },
    activation = { id: 'act-1', bombardment_done: false },
    tile = { planets: [{ name: PLANET_NAME }] },
    defenders = [],
    retreatPlanetRow = { tile_id: RETREAT_TILE_ID },
  } = {}) {
    let gpuCallCount = 0

    const unitInsertMock = vi.fn().mockResolvedValue({ error: null })
    const unitUpdateChain = makeUpdateChain()
    const unitUpdateMock = vi.fn().mockReturnValue(unitUpdateChain)

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
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
      if (table === 'game_player_units') {
        gpuCallCount++
        if (gpuCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (gpuCallCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: defenders, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (gpuCallCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: unitInsertMock,
            update: unitUpdateMock,
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
          insert: unitInsertMock,
          update: unitUpdateMock,
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: retreatPlanetRow, error: null }),
                }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_legendary_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return nullSafeChain()
    })

    return { unitUpdateMock, unitInsertMock }
  }

  it("Ragh's Call held by invader, Saar has ground forces on planet → Saar forces ejected; note returned", async () => {
    getHeldNotes.mockImplementation(async (gameId, noteName) => {
      if (noteName === "Ragh's Call") {
        return [{ instanceId: NOTE_ID, holderPlayerId: PLAYER_ID, ownerPlayerId: SAAR_ID }]
      }
      return []
    })

    const { unitUpdateMock } = mockDb39b({
      defenders: [{ id: 'saar-inf', player_id: SAAR_ID, unit_type: 'infantry', count: 2 }],
    })

    const res = await handler(makeRequest(PHASE39B_BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)

    expect(unitUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ system_key: RETREAT_SYSTEM_KEY, on_planet: RETREAT_PLANET }),
    )
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, SAAR_ID, expect.anything())
  })

  it("Ragh's Call not held → no ejection, no returnNote", async () => {
    getHeldNotes.mockResolvedValue([])

    mockDb39b({ defenders: [] })

    const res = await handler(makeRequest(PHASE39B_BASE_BODY))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalled()
  })
})

describe('phase 43c — commander passives', () => {
  function mockDb43c({
    player = { id: PLAYER_ID },
    game = { round: 1, map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } }, custodians_claimed: true },
    activation = { id: 'act-1', bombardment_done: false },
    tile = { planets: [{ name: PLANET_NAME }] },
    atkSpaceUnits = [],
    bombDefs = [],
    defenders = [],
    existingInfantry = null,
    scdDefs = [],
    insertedCombat = { id: 'combat-1' },
    legendaryExisting = null,
  } = {}) {
    let gpuCallCount = 0
    let unitsCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_system_activations') {
        return {
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
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: tile }),
            }),
          }),
        }
      }
      if (table === 'game_player_units') {
        gpuCallCount++
        const count = gpuCallCount
        if (count === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: atkSpaceUnits }),
                  }),
                }),
              }),
            }),
          }
        }
        if (count === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: defenders }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: existingInfantry }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'units') {
        unitsCallCount++
        if (unitsCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: bombDefs }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: scdDefs }),
            }),
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: insertedCombat }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_legendary_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: legendaryExisting }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return nullSafeChain()
    })
  }

  it('calls applyCommanderPassives with GROUND_COMBAT_START trigger', async () => {
    mockDb43c({ defenders: [{ id: 'def-unit', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1 }] })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 1,
    }))
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'GROUND_COMBAT_START',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: SYSTEM_KEY }),
      expect.anything(),
    )
  })

  it('Sol commander — pending_window returned for infantry placement window', async () => {
    mockDb43c({ defenders: [{ id: 'def-unit', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1 }] })
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'GROUND_COMBAT_START',
        faction: 'The Federation Of Sol',
        player_id: 'sol-player-id',
        effect: [{ op: 'place_units', unit_type: 'infantry', count: 1, target: 'active_planet' }],
      }],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: PLANET_NAME, troop_count: 1,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Federation Of Sol')
  })

  it("Sardakk commander — sardakkExtendedCommit flag allows planet from adjacent system", async () => {
    const ADJ_SYSTEM = '2,-1'
    const ADJ_PLANET = 'Tren'
    const ADJ_TILE_ID = 99

    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: "Sardakk N'orr", effect: 'sardakk_extended_commitment' }],
      pendingWindows: [],
    })
    getHandler.mockReturnValue(vi.fn().mockImplementation(async (ctx) => {
      ctx.sardakkExtendedCommit = true
    }))

    let activationsCallCount = 0
    let tilesCallCount = 0
    let gpuCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID } }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  round: 1,
                  custodians_claimed: true,
                  map_tiles: {
                    [SYSTEM_KEY]: { tile_id: TILE_ID },
                    [ADJ_SYSTEM]: { tile_id: ADJ_TILE_ID },
                  },
                },
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_system_activations') {
        activationsCallCount++
        const count = activationsCallCount
        if (count === 1) {
          // Main activation check for active system — return valid activation
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'act-1', bombardment_done: false } }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        // Adjacent system activation check — return null (player has no token there)
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
      if (table === 'tiles') {
        tilesCallCount++
        const count = tilesCallCount
        if (count === 1) {
          // Active system tile — planet NOT here
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { planets: [] } }),
              }),
            }),
          }
        }
        // Adjacent system tile — planet IS here
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { planets: [{ name: ADJ_PLANET }] } }),
            }),
          }),
        }
      }
      if (table === 'game_player_units') {
        gpuCallCount++
        const count = gpuCallCount
        if (count === 1) {
          // atkSpaceUnits — no bombardment ships
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
              }),
            }),
          }
        }
        if (count === 2) {
          // defenders — none (no combat → claim planet)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
              }),
            }),
          }
        }
        // existingInfantry
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
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
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }
      if (table === 'game_player_legendary_cards') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return nullSafeChain()
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, system_key: SYSTEM_KEY, planet_name: ADJ_PLANET, troop_count: 1,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })
})
