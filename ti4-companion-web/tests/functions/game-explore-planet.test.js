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
import { handler } from '../../../supabase/functions/game-explore-planet/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const PLANET_NAME = 'Mecatol Rex'
const TILE_ID = 'tile-1'

const BASE_GAME = { phase: 2, active_player_id: PLAYER_ID, map_tiles: {} }
const BASE_PLAYER = { id: PLAYER_ID, technologies: [] }
const BASE_PLANET = {
  id: 'gpp-1',
  game_id: GAME_ID,
  player_id: PLAYER_ID,
  planet_name: PLANET_NAME,
  tile_id: TILE_ID,
  exhausted: false,
  explored: false,
}
const BASE_TILE = {
  id: TILE_ID,
  planets: [{ name: PLANET_NAME, type: ['cultural'] }],
}
const BASE_DECK_CARDS = [
  { id: 'card-1', name: 'Cultural Relic Fragment', text: 'Gain a cultural relic fragment.', has_attachment: false, relic_fragment_type: 'cultural', state: 'deck', deck_position: 1 },
  { id: 'card-2', name: 'Dyson Sphere', text: 'Attach to planet.', has_attachment: true, relic_fragment_type: null, state: 'deck', deck_position: 2 },
  { id: 'card-3', name: 'Paradise World', text: 'Attach to planet.', has_attachment: true, relic_fragment_type: null, state: 'deck', deck_position: 3 },
]

function makeRequest(body) {
  return new Request('http://localhost/game-explore-planet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function baseBody(overrides = {}) {
  return {
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    planet_name: PLANET_NAME,
    deck_type: 'cultural',
    ...overrides,
  }
}

// Track call count per table so we can handle multiple calls to game_exploration_decks
function mockDb({
  game = BASE_GAME,
  gameError = null,
  player = BASE_PLAYER,
  playerError = null,
  planet = BASE_PLANET,
  planetError = null,
  tile = BASE_TILE,
  tileError = null,
  // For deck drawing: first call returns top card (or null if deckEmpty)
  deckCard = BASE_DECK_CARDS[0],
  deckCardError = null,
  deckEmpty = false,
  // For reshuffle path
  discards = [],
  discardFetchError = null,
  reshuffleError = null,
  updateError = null,
  exploreUpdateError = null,
  arcologiesReadyError = null,
} = {}) {
  let explorationSelectCallCount = 0
  let planetPlanetsCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }

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

    if (table === 'game_player_planets') {
      planetPlanetsCallCount++
      const callIndex = planetPlanetsCallCount
      const updateMock = vi.fn().mockImplementation((payload) => {
        if (payload && payload.exhausted === false) {
          const eqThird = vi.fn().mockResolvedValue({ error: arcologiesReadyError })
          const eqSecond = vi.fn().mockReturnValue({ eq: eqThird })
          const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond })
          return { eq: eqFirst }
        }
        return {
          eq: vi.fn().mockResolvedValue({ error: exploreUpdateError }),
        }
      })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: planet, error: planetError }),
              }),
            }),
          }),
        }),
        update: updateMock,
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

    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockImplementation(() => {
          explorationSelectCallCount++
          // First call: drawTopCard attempt
          if (explorationSelectCallCount === 1) {
            if (deckEmpty) {
              // Return empty (no deck cards)
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: deckCardError }),
                        }),
                      }),
                    }),
                  }),
                }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: deckCard, error: deckCardError }),
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          // Second call: fetch discards (reshuffle path)
          if (explorationSelectCallCount === 2) {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: discards, error: discardFetchError }),
                }),
              }),
            }
          }
          // Third call: drawTopCard after reshuffle
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: deckCard, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }

    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-explore-planet', () => {
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

  it('400 missing planet_name', async () => {
    const res = await handler(makeRequest(baseBody({ planet_name: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/planet_name/i)
  })

  it('400 missing deck_type', async () => {
    const res = await handler(makeRequest(baseBody({ deck_type: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/deck_type/i)
  })

  it('400 invalid deck_type (frontier not allowed)', async () => {
    const res = await handler(makeRequest(baseBody({ deck_type: 'frontier' })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/deck_type/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
  })

  it('409 Planet not controlled', async () => {
    mockDb({ planet: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Planet not controlled/i)
  })

  it('409 Planet already explored', async () => {
    mockDb({ planet: { ...BASE_PLANET, explored: true } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Planet already explored/i)
  })

  it('409 Invalid deck for planet trait (cultural deck on hazardous planet)', async () => {
    mockDb({
      tile: { id: TILE_ID, planets: [{ name: PLANET_NAME, type: ['hazardous'] }] },
    })
    const res = await handler(makeRequest(baseBody({ deck_type: 'cultural' })))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid deck for planet trait/i)
  })

  it('409 Exploration deck empty (no deck or discard rows)', async () => {
    mockDb({ deckEmpty: true, discards: [] })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Exploration deck empty/i)
  })

  it('draws top card and sets state=drawn', async () => {
    mockDb({ deckCard: BASE_DECK_CARDS[0] })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Lowest deck_position card should be returned
    expect(body.card_id).toBe('card-1')
  })

  it('reshuffles discards when deck empty', async () => {
    const discardCards = [
      { id: 'discard-1' },
      { id: 'discard-2' },
      { id: 'discard-3' },
    ]
    mockDb({
      deckEmpty: true,
      discards: discardCards,
      deckCard: { id: 'discard-1', name: 'Cultural Relic Fragment', text: 'Text', has_attachment: false, relic_fragment_type: 'cultural', state: 'deck', deck_position: 5 },
    })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_id).toBe('discard-1')
  })

  it('returns card metadata', async () => {
    const card = {
      id: 'card-1',
      name: 'Cultural Relic Fragment',
      text: 'Gain a cultural relic fragment.',
      has_attachment: false,
      relic_fragment_type: 'cultural',
      state: 'deck',
      deck_position: 1,
    }
    mockDb({ deckCard: card })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_id).toBe(card.id)
    expect(body.card_name).toBe(card.name)
    expect(body.card_text).toBe(card.text)
    expect(body.has_attachment).toBe(card.has_attachment)
    expect(body.relic_fragment_type).toBe(card.relic_fragment_type)
  })

  it('accepts any matching trait for multi-trait planet', async () => {
    // Planet has both cultural and hazardous traits; cultural deck should be valid
    mockDb({
      tile: { id: TILE_ID, planets: [{ name: PLANET_NAME, type: ['cultural', 'hazardous'] }] },
    })
    const res = await handler(makeRequest(baseBody({ deck_type: 'cultural' })))
    expect(res.status).toBe(200)
  })

  it('allows any deck type for planet with no traits (no type array)', async () => {
    mockDb({
      tile: { id: TILE_ID, planets: [{ name: PLANET_NAME, type: [] }] },
    })
    const res = await handler(makeRequest(baseBody({ deck_type: 'industrial' })))
    expect(res.status).toBe(200)
  })

  it('readies planet after exploration when Pre-Fab Arcologies owned', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: ['Pre-Fab Arcologies'] } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const allUpdates = []
    for (const call of db.from.mock.results) {
      if (call.value && call.value.update && call.value.update.mock) {
        for (const uc of call.value.update.mock.calls) {
          allUpdates.push(uc[0])
        }
      }
    }
    expect(allUpdates).toContainEqual({ exhausted: false })
  })

  it('does not ready planet when Pre-Fab Arcologies not owned', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [] } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const allUpdates = []
    for (const call of db.from.mock.results) {
      if (call.value && call.value.update && call.value.update.mock) {
        for (const uc of call.value.update.mock.calls) {
          allUpdates.push(uc[0])
        }
      }
    }
    expect(allUpdates).not.toContainEqual({ exhausted: false })
  })
})
