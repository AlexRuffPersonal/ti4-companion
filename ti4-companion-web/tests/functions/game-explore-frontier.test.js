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
import { handler } from '../../../supabase/functions/game-explore-frontier/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const SYSTEM_KEY = '0,0'

const BASE_GAME = { phase: 2, map_tiles: {} }
const BASE_PLAYER = { id: PLAYER_ID }
const BASE_PLAYER_WITH_TECH = { id: PLAYER_ID, technologies: ['Dark Energy Tap'] }
const BASE_SYSTEM_STATE = { id: 'ss-1', has_frontier_token: true, ion_storm: null, wormhole_type: null }

function makeCard(overrides = {}) {
  return {
    id: 'card-1',
    name: 'Lost Crew',
    state: 'deck',
    deck_position: 1,
    ...overrides,
  }
}

function makeRequest(body) {
  return new Request('http://localhost/game-explore-frontier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function baseBody(overrides = {}) {
  return {
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    system_key: SYSTEM_KEY,
    ...overrides,
  }
}

function mockDb({
  game = BASE_GAME,
  gameError = null,
  player = BASE_PLAYER,
  playerError = null,
  playerTech = BASE_PLAYER_WITH_TECH,
  playerTechError = null,
  systemState = BASE_SYSTEM_STATE,
  systemError = null,
  card = makeCard(),
  deckEmpty = false,
  discards = [],
  discardFetchError = null,
  discardUpdateError = null,
  frontierUpdateError = null,
  planetUpsertError = null,
} = {}) {
  let explorationSelectCallCount = 0
  let gamePlayersCallCount = 0

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
      gamePlayersCallCount++
      const callNum = gamePlayersCallCount
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(
                callNum === 1
                  ? { data: player, error: playerError }
                  : { data: playerTech, error: playerTechError }
              ),
            }),
            maybeSingle: vi.fn().mockResolvedValue(
              callNum === 2
                ? { data: playerTech, error: playerTechError }
                : { data: player, error: playerError }
            ),
          }),
        }),
      }
    }

    if (table === 'game_system_state') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: systemState, error: systemError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: frontierUpdateError }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: frontierUpdateError }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockImplementation(() => {
          explorationSelectCallCount++
          if (explorationSelectCallCount === 1) {
            if (deckEmpty) {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
                        maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          if (explorationSelectCallCount === 2) {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: discards, error: discardFetchError }),
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
                      maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: discardUpdateError }),
        }),
      }
    }

    if (table === 'game_player_planets') {
      return {
        upsert: vi.fn().mockResolvedValue({ error: planetUpsertError }),
      }
    }

    return { select: vi.fn(), update: vi.fn(), upsert: vi.fn(), insert: vi.fn() }
  })
}

describe('game-explore-frontier', () => {
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

  it('400 missing system_key', async () => {
    const res = await handler(makeRequest(baseBody({ system_key: undefined })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/system_key/i)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
  })

  it('409 Dark Energy Tap required', async () => {
    mockDb({ playerTech: { id: PLAYER_ID, technologies: [] } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Dark Energy Tap required/i)
  })

  it('409 No frontier token in system — system_state missing', async () => {
    mockDb({ systemState: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/No frontier token in system/i)
  })

  it('409 No frontier token in system — has_frontier_token false', async () => {
    mockDb({ systemState: { ...BASE_SYSTEM_STATE, has_frontier_token: false } })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/No frontier token in system/i)
  })

  it('409 Frontier deck empty — no deck or discard rows', async () => {
    mockDb({ deckEmpty: true, discards: [] })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Frontier deck empty/i)
  })

  it('draws frontier card and removes frontier token', async () => {
    mockDb({ card: makeCard({ name: 'Lost Crew' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_name).toBe('Lost Crew')

    const systemStateCalls = db.from.mock.calls
      .map((c, i) => ({ table: c[0], i }))
      .filter((x) => x.table === 'game_system_state')
    expect(systemStateCalls.length).toBeGreaterThanOrEqual(2)
    const lastSystemStateMock = db.from.mock.results[systemStateCalls[systemStateCalls.length - 1].i].value
    expect(lastSystemStateMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ has_frontier_token: false }),
      expect.anything()
    )
  })

  it('stores system_key on drawn card row', async () => {
    mockDb({ card: makeCard({ name: 'Lost Crew' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)

    // The second call to game_exploration_decks is the update({state:'drawn',...})
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(2)
    const drawnUpdateMock = db.from.mock.results[deckCallIndices[1]].value
    expect(drawnUpdateMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'drawn', system_key: SYSTEM_KEY, resolved_by_player_id: PLAYER_ID })
    )
  })

  it('applies relic fragment op for Unknown Relic Fragment', async () => {
    mockDb({ card: makeCard({ name: 'Unknown Relic Fragment' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_name).toBe('Unknown Relic Fragment')

    // Call order: [0]=select(draw), [1]=update(drawn), [2]=update(held)
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(3)
    const finalUpdateMock = db.from.mock.results[deckCallIndices[2]].value
    expect(finalUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })

  it('applies place_mirage op and sets Mirage in game_player_planets', async () => {
    mockDb({ card: makeCard({ name: 'Mirage' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_name).toBe('Mirage')

    const planetCall = db.from.mock.calls.find((c) => c[0] === 'game_player_planets')
    expect(planetCall).toBeTruthy()
    const planetMock = db.from.mock.results[db.from.mock.calls.indexOf(planetCall)].value
    expect(planetMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ planet_name: 'mirage', player_id: PLAYER_ID }),
      expect.anything()
    )
  })

  it('sets has_mirage=true in game_system_state for Mirage card', async () => {
    mockDb({ card: makeCard({ name: 'Mirage' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)

    // At least one upsert to game_system_state should include has_mirage:true
    const systemStateCalls = db.from.mock.calls
      .map((c, i) => ({ table: c[0], i }))
      .filter((x) => x.table === 'game_system_state')
    const upsertWithMirage = systemStateCalls.some((sc) => {
      const mock = db.from.mock.results[sc.i].value
      const calls = mock.upsert?.mock?.calls ?? []
      return calls.some((args) => args[0]?.has_mirage === true)
    })
    expect(upsertWithMirage).toBe(true)
  })

  it('sets card state=purged for Mirage (not discarded)', async () => {
    mockDb({ card: makeCard({ name: 'Mirage' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)

    // Call order: [0]=select(draw), [1]=update(drawn), [2]=update(purged)
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(3)
    const finalUpdateMock = db.from.mock.results[deckCallIndices[2]].value
    expect(finalUpdateMock.update).toHaveBeenCalledWith({ state: 'purged', resolved_by_player_id: null })
  })

  it('resolves Merchant Station choice=0 via replenish_commodities', async () => {
    mockDb({ card: makeCard({ name: 'Merchant Station' }) })
    const res = await handler(makeRequest(baseBody({ choice: 0 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op: 'replenish_commodities' })]),
      expect.anything(),
      expect.anything()
    )
  })

  it('resolves Merchant Station choice=1 via convert_all_commodities', async () => {
    mockDb({ card: makeCard({ name: 'Merchant Station' }) })
    const res = await handler(makeRequest(baseBody({ choice: 1 })))
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op: 'convert_all_commodities' })]),
      expect.anything(),
      expect.anything()
    )
  })

  it('applies place_map_token for Ion Storm', async () => {
    mockDb({ card: makeCard({ name: 'Ion Storm' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_name).toBe('Ion Storm')

    const systemStateCalls = db.from.mock.calls
      .map((c, i) => ({ table: c[0], i }))
      .filter((x) => x.table === 'game_system_state')
    expect(systemStateCalls.length).toBeGreaterThanOrEqual(2)

    const upsertWithIonStorm = systemStateCalls.some((sc) => {
      const mock = db.from.mock.results[sc.i].value
      const calls = mock.upsert?.mock?.calls ?? []
      return calls.some((args) => args[0]?.ion_storm === true)
    })
    expect(upsertWithIonStorm).toBe(true)
  })

  it('keeps Enigmatic Device in held state via hold_card op', async () => {
    mockDb({ card: makeCard({ name: 'Enigmatic Device' }) })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.card_name).toBe('Enigmatic Device')

    // Call order: [0]=select(draw), [1]=update(drawn), [2]=update(held)
    const deckCallIndices = db.from.mock.calls.reduce((acc, c, i) => (c[0] === 'game_exploration_decks' ? [...acc, i] : acc), [])
    expect(deckCallIndices.length).toBeGreaterThanOrEqual(3)
    const finalUpdateMock = db.from.mock.results[deckCallIndices[2]].value
    expect(finalUpdateMock.update).toHaveBeenCalledWith({ state: 'held', resolved_by_player_id: PLAYER_ID })
  })
})
