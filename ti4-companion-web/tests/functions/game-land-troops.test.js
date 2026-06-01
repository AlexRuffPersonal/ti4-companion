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

vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([])
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_LAND_TROOPS: 'land_troops',
}))
vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  assertMovementAllowed: vi.fn().mockResolvedValue(undefined),
  checkVpMaintenanceLaws: vi.fn().mockResolvedValue(undefined),
  LawError: class LawError extends Error {
    constructor(message, status = 409) {
      super(message)
      this.name = 'LawError'
      this.status = status
    }
  },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { assertMovementAllowed, checkVpMaintenanceLaws, LawError } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-land-troops/index.ts'

import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-land-troops', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const TILE_ID = 'tile-uuid'

const DEFAULT_MAP_TILES = {
  '1,-1': { tile_id: TILE_ID, tile_number: '32' },
  '0,0': { tile_id: 'mecatol-uuid', tile_number: '18' },
}

function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  game = { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
  gameError = null,
  activation = { id: 'act-1' },
  activationError = null,
  tile = { planets: [{ name: 'Wellon' }] },
  tileError = null,
  upsertPlanetError = null,
  existingUnit = null,
  insertUnitError = null,
  updateUnitError = null,
  custodianUpdateError = null,
  playerVp = { vp: 3 },
  vpUpdateError = null,
} = {}) {
  const planetUpsertMock = vi.fn().mockResolvedValue({ error: upsertPlanetError })
  const unitInsertMock = vi.fn().mockResolvedValue({ error: insertUnitError })
  const unitUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateUnitError }) })
  const gamesUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: custodianUpdateError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: vpUpdateError }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
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
                  maybeSingle: vi.fn().mockResolvedValue({ data: activation, error: activationError }),
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
            maybeSingle: vi.fn().mockResolvedValue({ data: tile, error: tileError }),
          }),
        }),
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
        upsert: planetUpsertMock,
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
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
  })

  return { planetUpsertMock, unitInsertMock, gamesUpdateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  assertMovementAllowed.mockResolvedValue(undefined)
  checkVpMaintenanceLaws.mockResolvedValue(undefined)
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-land-troops', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when troop_count is 0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when system not activated by caller', async () => {
    mockDb({ activation: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not activated/i)
  })

  it('returns 409 when planet not in system', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Nonexistent', troop_count: 1 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not found in system/i)
  })

  it('upserts planet and inserts infantry on success', async () => {
    const { planetUpsertMock, unitInsertMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
    expect(planetUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: 'Wellon', player_id: PLAYER_ID, tile_id: TILE_ID }),
      { onConflict: 'game_id,planet_name' }
    )
    expect(unitInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ unit_type: 'infantry', count: 1, on_planet: 'Wellon', player_id: PLAYER_ID })
    )
  })

  it('awards Custodians VP and sets flags when landing on Mecatol Rex', async () => {
    const { gamesUpdateMock } = mockDb({
      game: { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: false },
      tile: { planets: [{ name: 'Mecatol Rex' }] },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.custodians_claimed).toBe(true)
    expect(gamesUpdateMock).toHaveBeenCalledWith({ custodians_claimed: true, agenda_unlocked: true })
  })

  it('does not re-award Custodians if already claimed', async () => {
    mockDb({
      game: { round: 2, map_tiles: DEFAULT_MAP_TILES, custodians_claimed: true },
      tile: { planets: [{ name: 'Mecatol Rex' }] },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.custodians_claimed).toBeUndefined()
  })

  it('includes eliminatedPlayerIds in response', async () => {
    checkAndEliminate.mockResolvedValue(['pid'])
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual(['pid'])
  })

  it('empty eliminatedPlayerIds when no elimination', async () => {
    checkAndEliminate.mockResolvedValue([])
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eliminatedPlayerIds).toEqual([])
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1', planet_name: 'Wellon', troop_count: 1 }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'land_troops' }))
  })
})

describe('phase 39 — DMZ Mech Guard in game-land-troops', () => {
  const DMZ_ATTACHMENT_ID = 'dmz-attachment-uuid'

  const DEFAULT_MAP_TILES_P39 = {
    '1,-1': { tile_id: TILE_ID, tile_number: '32' },
  }

  function mockDbP39({
    player = { id: PLAYER_ID },
    game = { round: 2, map_tiles: DEFAULT_MAP_TILES_P39, custodians_claimed: false },
    activation = { id: 'act-1' },
    tile = { planets: [{ name: 'Wellon' }] },
    existingOwner = null,
    planetAttachments = [],
    attachmentNames = [],
  } = {}) {
    let planetCallCount = 0

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
            // vp query for custodians
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { vp: 3 }, error: null }),
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
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
      if (table === 'game_player_planets') {
        planetCallCount++
        const thisCall = planetCallCount
        if (thisCall === 1) {
          // 1st call: ownership check
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existingOwner, error: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        } else {
          // 2nd call: attachments check
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { attachments: planetAttachments },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
      }
      if (table === 'attachments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: attachmentNames.map(name => ({ name })),
              error: null,
            }),
          }),
        }
      }
      if (table === 'game_player_units') {
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
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    checkAndEliminate.mockResolvedValue([])
    requireAuth.mockResolvedValue(USER_ID)
    assertMovementAllowed.mockResolvedValue(undefined)
    checkVpMaintenanceLaws.mockResolvedValue(undefined)
    mockDbP39()
  })

  it('409 Cannot place a mech on a Demilitarized Zone planet', async () => {
    mockDbP39({
      planetAttachments: [DMZ_ATTACHMENT_ID],
      attachmentNames: ['Demilitarized Zone'],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Demilitarized Zone')
  })

  it('allows infantry landing even when DMZ attachment is present', async () => {
    mockDbP39({
      planetAttachments: [DMZ_ATTACHMENT_ID],
      attachmentNames: ['Demilitarized Zone'],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })

  it('allows mech landing when planet has no attachments', async () => {
    mockDbP39({
      planetAttachments: [],
      attachmentNames: [],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })

  it('allows mech landing when planet has attachments but none are DMZ', async () => {
    mockDbP39({
      planetAttachments: ['some-other-attachment-uuid'],
      attachmentNames: ['Terraform'],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      planet_name: 'Wellon',
      troop_count: 1,
      unit_type: 'mech',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.claimed).toBe(true)
  })
})

describe('phase 40 — Persistent Agenda Law Enforcement in game-land-troops', () => {
  const PREV_OWNER_ID = 'prev-owner-uuid'

  const DEFAULT_MAP_TILES_P40 = {
    '1,-1': { tile_id: TILE_ID, tile_number: '32' },
  }

  function mockDbP40({
    player = { id: PLAYER_ID },
    game = { round: 2, map_tiles: DEFAULT_MAP_TILES_P40, custodians_claimed: false },
    activation = { id: 'act-1' },
    tile = { planets: [{ name: 'Wellon' }] },
    existingOwner = null,
    existingUnit = null,
  } = {}) {
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
            // vp query for custodians
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { vp: 3 }, error: null }),
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
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
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
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingOwner, error: null }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    checkAndEliminate.mockResolvedValue([])
    requireAuth.mockResolvedValue(USER_ID)
    assertMovementAllowed.mockResolvedValue(undefined)
    checkVpMaintenanceLaws.mockResolvedValue(undefined)
    mockDbP40()
  })

  describe('assertMovementAllowed enforcement', () => {
    it('returns 409 when Demilitarized Zone is active and landing on the elected planet', async () => {
      const lawError = new LawError('Demilitarized Zone: units cannot enter this planet', 409)
      assertMovementAllowed.mockRejectedValue(lawError)

      mockDbP40()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain('Demilitarized Zone')
    })

    it('calls assertMovementAllowed with correct args before any DB write', async () => {
      mockDbP40()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(assertMovementAllowed).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        'Wellon'
      )
    })
  })

  describe('checkVpMaintenanceLaws enforcement', () => {
    it('calls checkVpMaintenanceLaws with correct args when a different player previously owned the planet', async () => {
      mockDbP40({ existingOwner: { player_id: PREV_OWNER_ID } })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).toHaveBeenCalledWith(
        expect.anything(),
        GAME_ID,
        PREV_OWNER_ID,
        'Wellon'
      )
    })

    it('does not call checkVpMaintenanceLaws when the planet had no previous owner', async () => {
      mockDbP40({ existingOwner: null })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).not.toHaveBeenCalled()
    })

    it('does not call checkVpMaintenanceLaws when the current player already owned the planet', async () => {
      mockDbP40({ existingOwner: { player_id: PLAYER_ID } })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(200)
      expect(checkVpMaintenanceLaws).not.toHaveBeenCalled()
    })

    it('checkVpMaintenanceLaws throws a DB error → returns 500', async () => {
      mockDbP40({ existingOwner: { player_id: PREV_OWNER_ID } })
      checkVpMaintenanceLaws.mockRejectedValue(new Error('DB failure'))

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 1,
      }))

      expect(res.status).toBe(500)
    })
  })

  describe('no laws active — unchanged behavior', () => {
    it('returns 200 with normal flow when no laws are active', async () => {
      assertMovementAllowed.mockResolvedValue(undefined)
      checkVpMaintenanceLaws.mockResolvedValue(undefined)
      mockDbP40()

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        system_key: '1,-1',
        planet_name: 'Wellon',
        troop_count: 2,
      }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.claimed).toBe(true)
    })
  })
})
