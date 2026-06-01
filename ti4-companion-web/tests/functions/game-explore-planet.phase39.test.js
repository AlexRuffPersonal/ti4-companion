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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-explore-planet/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const PLANET_NAME = 'Mecatol Rex'
const TILE_ID = 'tile-1'
const CARD_ID = 'card-1'

function makeRequest(body) {
  return new Request('http://localhost/game-explore-planet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({ game_id: GAME_ID, player_id: PLAYER_ID, planet_name: PLANET_NAME, deck_type: 'cultural', ...body }),
  })
}

function mockDb({ mapTiles = {} } = {}) {
  const deckUpdateArgs = []

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { phase: 2, active_player_id: PLAYER_ID, map_tiles: mapTiles },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, technologies: [] }, error: null }),
            }),
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
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'gpp-1', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: PLANET_NAME, tile_id: TILE_ID, exhausted: false, explored: false },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: TILE_ID, planets: [{ name: PLANET_NAME, type: ['cultural'] }] },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: CARD_ID, name: 'Cultural Relic Fragment', has_attachment: false, relic_fragment_type: 'cultural', state: 'deck', deck_position: 1 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((args) => {
          deckUpdateArgs.push(args)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })

  return { deckUpdateArgs }
}

describe('game-explore-planet Phase 39 — system_key storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('stores system_key on the drawn card row when planet tile found in map', async () => {
    const { deckUpdateArgs } = mockDb({
      mapTiles: { '2,1': { tile_id: TILE_ID } },
    })

    const res = await handler(makeRequest({}))
    expect(res.status).toBe(200)

    const drawnUpdate = deckUpdateArgs.find(a => a.state === 'drawn')
    expect(drawnUpdate).toBeDefined()
    expect(drawnUpdate.system_key).toBe('2,1')
    expect(drawnUpdate.planet_name).toBe(PLANET_NAME)
  })

  it('stores null system_key when planet tile not found in map', async () => {
    const { deckUpdateArgs } = mockDb({ mapTiles: {} })

    const res = await handler(makeRequest({}))
    expect(res.status).toBe(200)

    const drawnUpdate = deckUpdateArgs.find(a => a.state === 'drawn')
    expect(drawnUpdate).toBeDefined()
    expect(drawnUpdate.system_key).toBeNull()
  })
})
