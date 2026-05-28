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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-resolve-exploration-card/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const CARD_ID = 'card-1'

const BASE_PLAYER = { id: PLAYER_ID }

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
 * Build a mock db that handles all relevant tables.
 */
function mockDb({
  player = BASE_PLAYER,
  playerError = null,
  game = { phase: 3, map_tiles: [] },
  gameError = null,
  card = makeCard(),
  cardError = null,
  cardUpdateError = null,
  planetUpdateError = null,
  units = [],
  unitsError = null,
  unitUpdateError = null,
  relicDeckRow = null,
  relicDeckError = null,
  planetRows = null,
  planetRowsError = null,
  tileRows = null,
  tileRowsError = null,
  unitDef = null,
  unitDefError = null,
  existingMech = null,
  existingUnit = null,
  systemState = null,
} = {}) {
  db.from.mockImplementation((table) => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
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
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: planetUpdateError }),
            in: vi.fn().mockResolvedValue({ error: planetUpdateError }),
          }),
          in: vi.fn().mockResolvedValue({ error: planetUpdateError }),
        }),
      })
      const selectFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: planetRows, error: planetRowsError }),
          }),
        }),
      })
      return {
        select: selectFn,
        update: updateFn,
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      }
    }

    if (table === 'game_player_units') {
      return {
        // Handles:
        // - conditional_mech_or_infantry: .select().eq().eq().eq() resolved via then
        // - place_mech check: .select().eq().eq().eq().eq().maybeSingle() → existingMech
        // - freelancers unit check: .select().eq().eq().eq().eq().is().maybeSingle() → existingUnit
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                // conditional_mech_or_infantry resolves here via awaiting the query directly
                then: vi.fn((resolve) => resolve({ data: units, error: unitsError })),
                // place_mech_on_current_planet goes one level deeper
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existingMech, error: null }),
                  is: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingUnit, error: null }),
                  }),
                }),
              }),
            }),
          }),
        })),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: unitUpdateError }),
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

    if (table === 'game_relic_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: relicDeckRow, error: relicDeckError }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'game_system_state') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: systemState, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tileRows ?? [], error: tileRowsError }),
        }),
      }
    }

    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: unitDef, error: unitDefError }),
          }),
        }),
      }
    }

    return { select: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(), insert: vi.fn() }
  })
}

describe('game-resolve-exploration-card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest(baseBody({ game_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/i)
  })

  it('400 missing player_id', async () => {
    const res = await handler(makeRequest(baseBody({ player_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/player_id/i)
  })

  it('400 missing card_id', async () => {
    const res = await handler(makeRequest(baseBody({ card_id: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/card_id/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Player not found/i)
  })

  it('404 card not found', async () => {
    mockDb({ card: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Card not found/i)
  })

  it('409 Card not in drawn state', async () => {
    mockDb({ card: makeCard({ state: 'deck' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Card not in drawn state/i)
  })

  it('409 Not your card', async () => {
    mockDb({ card: makeCard({ resolved_by_player_id: 'other-player' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Not your card/i)
  })

  it('409 Unknown exploration card', async () => {
    mockDb({ card: makeCard({ name: 'Not A Real Card' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown exploration card/i)
  })

  it('applies gain_commodities op for Abandoned Warehouses choice=0', async () => {
    // Abandoned Warehouses choice=0 → gain_commodities (passthrough to applyAbility)
    mockDb({ card: makeCard({ name: 'Abandoned Warehouses', has_attachment: false, relic_fragment_type: null }) })
    const res = await handler(makeRequest(baseBody({ choice: 0 })))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Abandoned Warehouses')
    // applyAbility should have been called with gain_commodities op
    expect(applyAbility).toHaveBeenCalled()
    const calledOps = applyAbility.mock.calls[0][0]
    expect(calledOps.some((op) => op.op === 'gain_commodities')).toBe(true)
  })

  it('applies convert_commodities op for Abandoned Warehouses choice=1', async () => {
    mockDb({ card: makeCard({ name: 'Abandoned Warehouses', has_attachment: false, relic_fragment_type: null }) })
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const calledOps = applyAbility.mock.calls[0][0]
    expect(calledOps.some((op) => op.op === 'convert_commodities')).toBe(true)
  })

  it('applies attach_to_planet and sets explored=true for attachment cards', async () => {
    // Dyson Sphere is an attachment card
    mockDb({ card: makeCard({ name: 'Dyson Sphere', has_attachment: true }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Dyson Sphere')

    // Card should be discarded (attach_to_planet op handles the attachment DB write)
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'discarded', resolved_by_player_id: null })
    // planet should be marked explored
    const planetFrom = db.from.mock.calls.find((c) => c[0] === 'game_player_planets')
    expect(planetFrom).toBeTruthy()
  })

  it('applies gain_relic_fragment and sets state=held for relic fragments', async () => {
    mockDb({
      card: makeCard({
        name: 'Cultural Relic Fragment',
        relic_fragment_type: 'cultural',
        has_attachment: false,
        deck_type: 'cultural',
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Cultural Relic Fragment')

    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  it('keeps Enigmatic Device in held state', async () => {
    mockDb({
      card: makeCard({
        name: 'Enigmatic Device',
        relic_fragment_type: null,
        has_attachment: false,
        deck_type: 'frontier',
        planet_name: null,
        purge: false,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Enigmatic Device')

    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  it('discards non-special cards and sets explored=true', async () => {
    mockDb({
      card: makeCard({
        name: 'Mercenary Outfit',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Mercenary Outfit')
    expect(applyAbility).toHaveBeenCalled()
    const planetFromCall = db.from.mock.calls.find((c) => c[0] === 'game_player_planets')
    expect(planetFromCall).toBeTruthy()
    const planetMock = db.from.mock.results[db.from.mock.calls.indexOf(planetFromCall)].value
    expect(planetMock.update).toHaveBeenCalledWith({ explored: true })
  })

  it('returns 200 with applied card name on success', async () => {
    mockDb({ card: makeCard({ name: 'Paradise World', has_attachment: true }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Paradise World')
  })

  it('does not require choice or remove_infantry fields', async () => {
    // Mercenary Outfit — no choice needed
    mockDb({
      card: makeCard({
        name: 'Mercenary Outfit',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
      }),
    })
    // No choice or remove_infantry in body
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
  })

  // ── New tests for p39 changes ────────────────────────────────────────────────

  it('passes system_key from card row to dispatch context', async () => {
    // Use Gamma Wormhole which calls place_map_token and uses ctx.systemKey
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
    // Verify game_system_state was touched (place_map_token uses systemKey)
    const systemStateCall = db.from.mock.calls.find((c) => c[0] === 'game_system_state')
    expect(systemStateCall).toBeTruthy()
  })

  it('applies ready_current_planet for Expedition with mech present', async () => {
    mockDb({
      card: makeCard({
        name: 'Expedition',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'hazardous',
        planet_name: 'Mecatol Rex',
      }),
      units: [{ id: 'unit-1', unit_type: 'mech', count: 1 }],
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // Verify game_player_planets was called (ready_current_planet does an update)
    let foundReadyUpdate = false
    for (let i = 0; i < db.from.mock.calls.length; i++) {
      if (db.from.mock.calls[i]?.[0] === 'game_player_planets') {
        const mock = db.from.mock.results[i]?.value
        if (mock?.update?.mock?.calls?.some((c) => c[0]?.exhausted === false)) {
          foundReadyUpdate = true
          break
        }
      }
    }
    expect(foundReadyUpdate).toBe(true)
  })

  it('applies convert_all_commodities for Merchant Station choice=1', async () => {
    mockDb({
      card: makeCard({
        name: 'Merchant Station',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
      }),
    })
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const allOps = applyAbility.mock.calls.flatMap((c) => c[0])
    expect(allOps.some((op) => op.op === 'convert_all_commodities')).toBe(true)
  })

  it('applies gain_command_token_choice for Volatile Fuel Source with mech', async () => {
    mockDb({
      card: makeCard({
        name: 'Volatile Fuel Source',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'hazardous',
        planet_name: 'Mecatol Rex',
      }),
      units: [{ id: 'unit-1', unit_type: 'mech', count: 1 }],
    })
    const res = await handler(makeRequest(baseBody({ command_token_bucket: 'fleet' })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalled()
    const allOps = applyAbility.mock.calls.flatMap((c) => c[0])
    expect(allOps.some((op) => op.op === 'gain_command_token_choice')).toBe(true)
    // Verify context had command_token_bucket set
    const ctx = applyAbility.mock.calls[0][1]
    expect(ctx.selections?.command_token_bucket).toBe('fleet')
  })

  it('applies clear_planet_units_and_structures for Demilitarized Zone', async () => {
    mockDb({
      card: makeCard({
        name: 'Demilitarized Zone',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Wellon',
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // Verify game_player_planets updated with space_dock_unit_id=null, pds_count=0
    let foundDemilUpdate = false
    for (let i = 0; i < db.from.mock.calls.length; i++) {
      if (db.from.mock.calls[i]?.[0] === 'game_player_planets') {
        const mock = db.from.mock.results[i]?.value
        if (mock?.update?.mock?.calls?.some((c) => c[0]?.space_dock_unit_id === null)) {
          foundDemilUpdate = true
          break
        }
      }
    }
    expect(foundDemilUpdate).toBe(true)
    // Verify game_player_units delete was called
    const unitDeleteCalls = db.from.mock.calls.filter((c) => c[0] === 'game_player_units')
    expect(unitDeleteCalls.length).toBeGreaterThan(0)
  })

  it('applies gain_named_relic for Tomb Of Emphidia', async () => {
    const crownRow = { id: 'relic-1' }
    mockDb({
      card: makeCard({
        name: 'Tomb Of Emphidia',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
      }),
      relicDeckRow: crownRow,
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // Verify game_relic_deck update was called with state='held'
    let foundRelicUpdate = false
    for (let i = 0; i < db.from.mock.calls.length; i++) {
      if (db.from.mock.calls[i]?.[0] === 'game_relic_deck') {
        const mock = db.from.mock.results[i]?.value
        if (mock?.update?.mock?.calls?.some((c) => c[0]?.state === 'held')) {
          foundRelicUpdate = true
          break
        }
      }
    }
    expect(foundRelicUpdate).toBe(true)
  })

  it('skips gain_named_relic silently if Crown of Emphidia not in deck', async () => {
    mockDb({
      card: makeCard({
        name: 'Tomb Of Emphidia',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
      }),
      relicDeckRow: null, // not in deck
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200) // no error, silently skipped
    // relic_deck update should not have been called
    let anyRelicUpdate = false
    for (let i = 0; i < db.from.mock.calls.length; i++) {
      if (db.from.mock.calls[i]?.[0] === 'game_relic_deck') {
        const mock = db.from.mock.results[i]?.value
        if (mock?.update?.mock?.calls?.length > 0) {
          anyRelicUpdate = true
          break
        }
      }
    }
    expect(anyRelicUpdate).toBe(false)
  })

  it('sets state=held for hold_card (Enigmatic Device)', async () => {
    mockDb({
      card: makeCard({
        name: 'Enigmatic Device',
        relic_fragment_type: null,
        has_attachment: false,
        deck_type: 'frontier',
        planet_name: null,
        purge: false,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Enigmatic Device')

    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  it('sets state=purged for purge:true card (Gamma Wormhole)', async () => {
    mockDb({
      card: makeCard({
        name: 'Gamma Wormhole',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'frontier',
        planet_name: null,
        system_key: '0,0',
        purge: true,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)

    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'purged', resolved_by_player_id: null })
  })

  it('applies freelancers_produce when unit_type provided', async () => {
    const planetRow = { planet_name: 'Mecatol Rex', exhausted: false, tile_id: 'tile-1' }
    const tileRow = { id: 'tile-1', planets: [{ name: 'Mecatol Rex', resources: 3, influence: 0 }] }
    const unitDefRow = { name: 'infantry', cost: 1 }
    mockDb({
      card: makeCard({
        name: 'Freelancers',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
        system_key: '0,0',
      }),
      planetRows: [planetRow],
      tileRows: [tileRow],
      unitDef: unitDefRow,
    })
    const res = await handler(makeRequest(baseBody({
      unit_type: 'infantry',
      resource_planet_names: ['Mecatol Rex'],
    })))
    expect(res.status).toBe(200)
    // planet should be exhausted
    let foundExhaustUpdate = false
    for (let i = 0; i < db.from.mock.calls.length; i++) {
      if (db.from.mock.calls[i]?.[0] === 'game_player_planets') {
        const mock = db.from.mock.results[i]?.value
        if (mock?.update?.mock?.calls?.some((c) => c[0]?.exhausted === true)) {
          foundExhaustUpdate = true
          break
        }
      }
    }
    expect(foundExhaustUpdate).toBe(true)
    // units table was queried (for unit insert)
    const unitsCalls = db.from.mock.calls.filter((c) => c[0] === 'game_player_units')
    expect(unitsCalls.length).toBeGreaterThan(0)
  })

  it('skips freelancers_produce when unit_type omitted', async () => {
    mockDb({
      card: makeCard({
        name: 'Freelancers',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
      }),
    })
    // No unit_type in body
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    // No tiles query, no units ref query
    const tilesCalls = db.from.mock.calls.filter((c) => c[0] === 'tiles')
    expect(tilesCalls.length).toBe(0)
    const unitsCalls = db.from.mock.calls.filter((c) => c[0] === 'units')
    expect(unitsCalls.length).toBe(0)
  })

  it('409 when freelancers resources insufficient', async () => {
    const planetRow = { planet_name: 'Mecatol Rex', exhausted: false, tile_id: 'tile-1' }
    const tileRow = { id: 'tile-1', planets: [{ name: 'Mecatol Rex', resources: 0, influence: 0 }] }
    const unitDefRow = { name: 'carrier', cost: 3 }
    mockDb({
      card: makeCard({
        name: 'Freelancers',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'cultural',
        planet_name: 'Mecatol Rex',
        system_key: '0,0',
      }),
      planetRows: [planetRow],
      tileRows: [tileRow],
      unitDef: unitDefRow,
    })
    const res = await handler(makeRequest(baseBody({
      unit_type: 'carrier',
      resource_planet_names: ['Mecatol Rex'],
    })))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Insufficient resources/i)
  })

  it('409 Planet already has a mech for place_mech_on_current_planet', async () => {
    mockDb({
      card: makeCard({
        name: 'Local Fabricators',
        has_attachment: false,
        relic_fragment_type: null,
        deck_type: 'industrial',
        planet_name: 'Mecatol Rex',
        system_key: '0,0',
      }),
      existingMech: { id: 'mech-1', count: 1 },
    })
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Planet already has a mech/i)
  })
})
