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
import { handler } from '../../../supabase/functions/game-commit-ground-forces/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const DEFENDER_ID = 'defender-uuid'
const TILE_ID = 42
const SYSTEM_KEY = '1,-1'
const PLANET_NAME = 'Wellon'

function makeRequest(body) {
  return new Request('http://localhost/game-commit-ground-forces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

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

    return { select: vi.fn(), insert: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })

  return { planetUpsertMock, unitInsertMock, unitUpdateMock, combatInsertMock, gamesUpdateMock, legendaryInsertMock, legendaryUpdateMock, gamePlayerUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
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
