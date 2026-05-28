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
 * Build a mock db that handles:
 * - game_players (player lookup)
 * - games (game fetch)
 * - game_exploration_decks (card fetch + update)
 * - game_player_planets (explored update)
 * - game_player_units (conditional_mech_or_infantry)
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
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: planetUpdateError }),
            }),
          }),
        }),
      }
    }

    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: units, error: unitsError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: unitUpdateError }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    return { select: vi.fn(), update: vi.fn(), delete: vi.fn() }
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
    // The second game_exploration_decks call is the update (first is the select/fetch)
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

    // Find the game_exploration_decks mock instance and verify update was called with state='held'
    // The second game_exploration_decks call is the update (first is the select/fetch)
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const deckUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(deckUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  it('keeps Enigmatic Device in held state', async () => {
    mockDb({
      card: makeCard({
        name: 'Enigmatic Device',
        relic_fragment_type: 'enigmatic_device',
        has_attachment: false,
        deck_type: 'frontier',
        planet_name: null,
      }),
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applied).toBe('Enigmatic Device')

    // Verify update called with state='held' and resolved_by_player_id=PLAYER_ID
    // The second game_exploration_decks call is the update (first is the select/fetch)
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
})
