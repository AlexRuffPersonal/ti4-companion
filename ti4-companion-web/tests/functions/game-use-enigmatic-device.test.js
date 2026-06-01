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
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-use-enigmatic-device/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-use-enigmatic-device', body)

const CARD_ID = 'card-1'
const TECH_NAME = 'Neural Motivator'
const PLANET_1 = 'mecatol rex'
const PLANET_2 = 'vefut ii'
const TILE_ID_1 = 'tile-1'

const BASE_PLAYER = { id: PLAYER_ID }

const BASE_CARD = {
  id: CARD_ID,
  state: 'held',
  resolved_by_player_id: PLAYER_ID,
  name: 'Enigmatic Device',
}

const BASE_PLANETS = [
  { id: 'pp-1', planet_name: PLANET_1, tile_id: TILE_ID_1, exhausted: false },
  { id: 'pp-2', planet_name: PLANET_2, tile_id: TILE_ID_1, exhausted: false },
]

const BASE_TILES = [
  {
    id: TILE_ID_1,
    planets: [
      { name: PLANET_1, resources: 4 },
      { name: PLANET_2, resources: 2 },
    ],
  },
]

const BASE_BODY = {
  game_id: GAME_ID,
  player_id: PLAYER_ID,
  card_id: CARD_ID,
  resource_planet_names: [PLANET_1, PLANET_2],
  technology_name: TECH_NAME,
}

function mockDb({
  player = BASE_PLAYER,
  playerError = null,
  card = BASE_CARD,
  cardError = null,
  planets = BASE_PLANETS,
  planetsError = null,
  tiles = BASE_TILES,
  tilesError = null,
  exhaustError = null,
  purgeError = null,
} = {}) {
  buildDbMock(db, {
    game_players: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
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
    }),
    game_exploration_decks: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: card, error: cardError }),
          }),
        }),
      }),
      update: vi.fn().mockImplementation((vals) => {
        if (vals.state === 'purged') {
          return { eq: vi.fn().mockResolvedValue({ error: purgeError }) }
        }
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: exhaustError }),
            }),
          }),
        }
      }),
    }),
    game_player_planets: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: planets, error: planetsError }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: exhaustError }),
          }),
        }),
      }),
    }),
    tiles: () => ({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: tiles, error: tilesError }),
      }),
    }),
  })
}

describe('game-use-enigmatic-device', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    applyAbility.mockResolvedValue(undefined)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const { game_id: _, ...rest } = BASE_BODY
    const res = await handler(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/i)
  })

  it('400 missing player_id', async () => {
    const { player_id: _, ...rest } = BASE_BODY
    const res = await handler(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/player_id/i)
  })

  it('400 missing card_id', async () => {
    const { card_id: _, ...rest } = BASE_BODY
    const res = await handler(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/card_id/i)
  })

  it('400 missing resource_planet_names', async () => {
    const { resource_planet_names: _, ...rest } = BASE_BODY
    const res = await handler(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/resource_planet_names/i)
  })

  it('400 missing technology_name', async () => {
    const { technology_name: _, ...rest } = BASE_BODY
    const res = await handler(makeRequest(rest))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/technology_name/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(404)
  })

  it('404 card not found', async () => {
    mockDb({ card: null })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/card not found/i)
  })

  it('409 Card not in held state', async () => {
    mockDb({ card: { ...BASE_CARD, state: 'discarded' } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not in held state/i)
  })

  it('409 Not your card', async () => {
    mockDb({ card: { ...BASE_CARD, resolved_by_player_id: 'other-player' } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not your card/i)
  })

  it('409 Card is not an Enigmatic Device', async () => {
    mockDb({ card: { ...BASE_CARD, name: 'Ancient Tomb' } })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not an enigmatic device/i)
  })

  it('409 One or more planets not found or not controlled', async () => {
    // Only returns 1 planet when 2 were requested
    mockDb({ planets: [BASE_PLANETS[0]] })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not found or not controlled/i)
  })

  it('409 One or more planets are already exhausted', async () => {
    mockDb({
      planets: [
        { ...BASE_PLANETS[0], exhausted: true },
        BASE_PLANETS[1],
      ],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exhausted/i)
  })

  it('409 Insufficient resources (need 6)', async () => {
    mockDb({
      tiles: [
        {
          id: TILE_ID_1,
          planets: [
            { name: PLANET_1, resources: 2 },
            { name: PLANET_2, resources: 1 },
          ],
        },
      ],
    })
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/insufficient resources/i)
  })

  it('researches technology and purges card on success', async () => {
    // Base: 4+2 = 6 resources — exactly enough
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.technology).toBe(TECH_NAME)
    expect(applyAbility).toHaveBeenCalledWith(
      [{ op: 'gain_technology' }],
      {
        gameId: GAME_ID,
        activatingPlayerId: PLAYER_ID,
        selections: { technology_name: TECH_NAME },
      },
      expect.anything()
    )
  })

  it('propagates 409 from applyAbility when tech prereqs not met', async () => {
    const err = Object.assign(new Error('Prerequisites not met'), { status: 409 })
    applyAbility.mockRejectedValue(err)
    const res = await handler(makeRequest(BASE_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/prerequisites not met/i)
  })
})
