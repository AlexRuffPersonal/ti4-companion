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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn().mockResolvedValue(undefined),
  dslError: vi.fn((msg, status = 409) => {
    const err = new Error(msg)
    err.status = status
    return err
  }),
}))

vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-resolve-exploration-card/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const CARD_ID = 'card-1'

function makeCard(overrides = {}) {
  return {
    id: CARD_ID,
    game_id: GAME_ID,
    deck_type: 'cultural',
    state: 'drawn',
    deck_position: null,
    name: 'Dyson Sphere',
    text: 'Attach to planet.',
    has_attachment: true,
    relic_fragment_type: null,
    resolved_by_player_id: PLAYER_ID,
    planet_name: 'Mecatol Rex',
    system_key: null,
    purge: false,
    ...overrides,
  }
}

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-exploration-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function baseBody(overrides = {}) {
  return {
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    card_id: CARD_ID,
    ...overrides,
  }
}

/**
 * Flexible mockDb builder — callers can pass extra table handlers.
 */
function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  game = { phase: 3, map_tiles: [] },
  card = makeCard(),
  cardError = null,
  cardUpdateError = null,
  planetUpdateError = null,
  units = [],
  unitsError = null,
  extraHandlers = {},
} = {}) {
  db.from.mockImplementation((table) => {
    if (extraHandlers[table]) return extraHandlers[table]()

    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
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
      }
    }

    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: card, error: cardError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: cardUpdateError }),
        }),
      }
    }

    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: planetUpdateError }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'game_player_units') {
      // makeResult returns a thenable that resolves to {data,error} for array queries,
      // but also exposes .maybeSingle() for single-row queries.
      const makeResult = (data, error) => {
        const p = Promise.resolve({ data, error })
        p.maybeSingle = vi.fn().mockResolvedValue({ data: Array.isArray(data) ? (data[0] ?? null) : data, error })
        return p
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn(() => makeResult(units, unitsError)),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'game_system_state') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

describe('game-resolve-exploration-card (p39 additions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  // ── system_key from card row ──────────────────────────────────────────────

  it('passes system_key from card row to dispatch context', async () => {
    // Gamma Relay triggers place_map_token which uses systemKey
    mockDb({
      card: makeCard({
        name: 'Gamma Relay',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
        system_key: '3,-1',
        purge: false,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // place_map_token calls game_system_state — confirm it's reached
    const systemStateCalls = db.from.mock.calls.filter(c => c[0] === 'game_system_state')
    expect(systemStateCalls.length).toBeGreaterThan(0)
  })

  // ── ready_current_planet (Expedition) ────────────────────────────────────

  it('applies ready_current_planet for Expedition with mech present', async () => {
    const planetPlanetsMock = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    mockDb({
      card: makeCard({
        name: 'Expedition',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'hazardous',
        planet_name: 'Mecatol Rex',
        system_key: null,
        purge: false,
      }),
      units: [{ id: 'u1', unit_type: 'mech', count: 1 }],
      extraHandlers: {
        game_player_planets: () => planetPlanetsMock,
      },
    })

    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // applyAbility should be called with ready_current_planet op
    expect(applyAbility).toHaveBeenCalled()
    const calledOps = applyAbility.mock.calls[0][0]
    expect(calledOps.some(op => op.op === 'ready_current_planet')).toBe(true)
  })

  // ── convert_all_commodities (Merchant Station choice=1) ──────────────────

  it('applies convert_all_commodities for Merchant Station choice=1', async () => {
    mockDb({
      card: makeCard({
        name: 'Merchant Station',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
        system_key: null,
        purge: false,
      }),
    })
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const calledOps = applyAbility.mock.calls[0][0]
    expect(calledOps.some(op => op.op === 'convert_all_commodities')).toBe(true)
  })

  // ── gain_command_token_choice (Volatile Fuel Source) ─────────────────────

  it('applies gain_command_token_choice for Volatile Fuel Source with mech', async () => {
    mockDb({
      card: makeCard({
        name: 'Volatile Fuel Source',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'hazardous',
        planet_name: 'Mecatol Rex',
        system_key: null,
        purge: false,
      }),
      units: [{ id: 'u1', unit_type: 'mech', count: 1 }],
    })
    const res = await handler(makeRequest(baseBody({ command_token_bucket: 'fleet' })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const calledOps = applyAbility.mock.calls[0][0]
    expect(calledOps.some(op => op.op === 'gain_command_token_choice')).toBe(true)
    // context selections should include command_token_bucket='fleet'
    const calledContext = applyAbility.mock.calls[0][1]
    expect(calledContext.selections?.command_token_bucket).toBe('fleet')
  })

  // ── clear_planet_units_and_structures (Demilitarized Zone) ───────────────

  it('applies clear_planet_units_and_structures for Demilitarized Zone', async () => {
    let allPlanetUpdates = []
    let unitDeleteCalled = false

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Demilitarized Zone',
                    has_attachment: true,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Wellon',
                    system_key: null,
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        const updateMock = vi.fn().mockImplementation((data) => {
          allPlanetUpdates.push(data)
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        })
        return {
          update: updateMock,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          delete: vi.fn().mockImplementation(() => {
            unitDeleteCalled = true
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // game_player_planets updated with space_dock_unit_id=null, pds_count=0 at some point
    expect(allPlanetUpdates).toContainEqual(expect.objectContaining({ space_dock_unit_id: null, pds_count: 0 }))
    // game_player_units deleted for on_planet='Wellon'
    expect(unitDeleteCalled).toBe(true)
  })

  // ── gain_named_relic (Tomb Of Emphidia) ──────────────────────────────────

  it('applies gain_named_relic for Tomb Of Emphidia when Crown of Emphidia is in deck', async () => {
    let relicUpdated = false

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Tomb Of Emphidia',
                    has_attachment: true,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Mecatol Rex',
                    system_key: null,
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_relic_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'relic-1' }, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation(() => {
            relicUpdated = true
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    expect(relicUpdated).toBe(true)
  })

  it('skips gain_named_relic silently if Crown of Emphidia not in deck', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Tomb Of Emphidia',
                    has_attachment: true,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Mecatol Rex',
                    system_key: null,
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_relic_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),  // not in deck
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest(baseBody()))
    // should succeed silently
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Tomb Of Emphidia')
  })

  // ── hold_card (Enigmatic Device) ─────────────────────────────────────────

  it('sets state=held for hold_card (Enigmatic Device)', async () => {
    mockDb({
      card: makeCard({
        name: 'Enigmatic Device',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
        system_key: null,
        purge: false,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Enigmatic Device')

    // Verify card updated to held state
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  // ── purge (Gamma Wormhole) ────────────────────────────────────────────────

  it('sets state=purged for purge:true card (Gamma Wormhole)', async () => {
    mockDb({
      card: makeCard({
        name: 'Gamma Wormhole',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
        system_key: '3,-1',
        purge: true,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)

    // Verify card updated to purged state
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'purged', resolved_by_player_id: null })
  })

  // ── freelancers_produce ───────────────────────────────────────────────────

  it('applies freelancers_produce when unit_type provided', async () => {
    let planetExhausted = false
    let unitInserted = false

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Freelancers',
                    has_attachment: false,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Mecatol Rex',
                    system_key: '0,0',
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { cost: 1 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ planet_name: 'Mecatol Rex', exhausted: false, tile_id: 'tile-1' }],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation(() => {
            planetExhausted = true
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockResolvedValue({ error: null }),
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'tile-1', planets: { 'Mecatol Rex': { resources: 1, influence: 6 } } }],
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
                    is: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation(() => {
            unitInserted = true
            return Promise.resolve({ error: null })
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest(baseBody({
      unit_type: 'infantry',
      resource_planet_names: ['Mecatol Rex'],
    })))
    expect(res.status).toBe(200)
    expect(planetExhausted).toBe(true)
    expect(unitInserted).toBe(true)
  })

  it('skips freelancers_produce when unit_type omitted', async () => {
    let unitInserted = false

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Freelancers',
                    has_attachment: false,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Mecatol Rex',
                    system_key: '0,0',
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
          insert: vi.fn().mockImplementation(() => { unitInserted = true; return Promise.resolve({ error: null }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    // No unit_type in body
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    expect(unitInserted).toBe(false)
  })

  it('409 when freelancers resources insufficient', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Freelancers',
                    has_attachment: false,
                    relic_fragment_type: null,
                    deck_type: 'cultural',
                    planet_name: 'Mecatol Rex',
                    system_key: '0,0',
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // unit costs 10 — way more than planet provides
              maybeSingle: vi.fn().mockResolvedValue({ data: { cost: 10 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ planet_name: 'Mecatol Rex', exhausted: false, tile_id: 'tile-1' }],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'tile-1', planets: { 'Mecatol Rex': { resources: 1, influence: 1 } } }],
              error: null,
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest(baseBody({
      unit_type: 'dreadnought',
      resource_planet_names: ['Mecatol Rex'],
    })))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Insufficient resources/i)
  })

  // ── place_mech_on_current_planet (Local Fabricators) ─────────────────────

  it('409 Planet already has a mech for place_mech_on_current_planet', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { phase: 3, map_tiles: [] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: makeCard({
                    name: 'Local Fabricators',
                    has_attachment: false,
                    relic_fragment_type: null,
                    deck_type: 'industrial',
                    planet_name: 'Mecatol Rex',
                    system_key: '0,0',
                    purge: false,
                  }),
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1', count: 1 }, error: null }),
                  }),
                }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    // Local Fabricators choice=1 → spend_trade_goods + place_mech_on_current_planet
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Planet already has a mech/i)
  })
})
