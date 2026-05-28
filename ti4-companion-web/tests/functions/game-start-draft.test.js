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
import { handler } from '../../../supabase/functions/game-start-draft/index.ts'

const USER_ID = 'user-host'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'

function makeRequest(body) {
  return new Request('http://localhost/game-start-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function makeGame(overrides = {}) {
  return {
    id: GAME_ID,
    status: 'lobby',
    host_user_id: USER_ID,
    expansions: { base: true, pok: false },
    speaker: 'player-1',
    draft_state: null,
    ...overrides,
  }
}

function makePlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    user_id: `user-${i + 1}`,
    seat_index: i,
  }))
}

function makeBlue(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `tile-b-${i}`,
    tile_number: `b${i + 1}`,
    type: 'blue',
    expansion: 'base',
    planets: [{ resources: 1, influence: 1 }],
    anomaly: null,
    wormhole: null,
  }))
}

function makeRed(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `tile-r-${i}`,
    tile_number: `r${i + 1}`,
    type: 'red',
    expansion: 'base',
    planets: [],
    anomaly: null,
    wormhole: null,
  }))
}

function mockDb({ game = makeGame(), players = makePlayers(6), tiles = null } = {}) {
  const blueTiles = makeBlue(40)
  const redTiles = makeRed(20)
  const allTiles = tiles ?? [...blueTiles, ...redTiles]

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: players }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: allTiles }),
          }),
        }),
      }
    }
    return {}
  })
}

describe('game-start-draft', () => {
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
    requireAuth.mockRejectedValue(new AuthError('Missing auth'))
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ mode: 'official' }))
    expect(res.status).toBe(400)
  })

  it('400 missing mode', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('400 invalid mode value', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'random' }))
    expect(res.status).toBe(400)
  })

  it('404 game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(404)
  })

  it('403 non-host user', async () => {
    mockDb({ game: makeGame({ host_user_id: 'other-user' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(403)
  })

  it('409 game not in lobby', async () => {
    mockDb({ game: makeGame({ status: 'active' }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(409)
  })

  it('409 draft already active', async () => {
    mockDb({ game: makeGame({ draft_state: { mode: 'official', phase: 'placement' } }) })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(409)
  })

  it('409 player count < 3', async () => {
    mockDb({ players: makePlayers(2) })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(409)
  })

  it('official 6P: 6 hands of 5 tiles each (3B+2R); placement_order length=30; phase=placement', async () => {
    const players = makePlayers(6)
    mockDb({ game: makeGame({ speaker: players[0].id }), players })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.phase).toBe('placement')
    expect(data.player_count).toBe(6)

    // Check the update call was made
    expect(db.from).toHaveBeenCalledWith('games')
    const updateCall = db.from.mock.results.find((r, i) => {
      return db.from.mock.calls[i][0] === 'games'
    })
    expect(updateCall).toBeTruthy()
  })

  it('official 3P: 3 hands of 8 tiles each (6B+2R); placement_order length=24', async () => {
    const players = makePlayers(3)
    mockDb({ game: makeGame({ speaker: players[0].id }), players })
    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.phase).toBe('placement')
    expect(data.player_count).toBe(3)
  })

  it('official 5P: speaker hand length=7 (4B+3R), others length=6 (4B+2R)', async () => {
    const players = makePlayers(5)
    mockDb({ game: makeGame({ speaker: players[0].id }), players })

    // Capture the draft_state update
    let capturedState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: makeGame({ speaker: players[0].id }) }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedState = state.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: players }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [...makeBlue(40), ...makeRed(20)] }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'official' }))
    expect(res.status).toBe(200)
    expect(capturedState).not.toBeNull()
    const hands = capturedState.hands
    // Speaker hand = 4B+3R = 7; others = 4B+2R = 6
    expect(hands[players[0].id]).toHaveLength(7)
    expect(hands[players[1].id]).toHaveLength(6)
  })

  it('milty 6P: 6 slices; each slice has 5 tiles (3B+2R); max_score-min_score <= 2; phase=slice-pick', async () => {
    const players = makePlayers(6)
    mockDb({ game: makeGame({ speaker: players[0].id }), players })

    let capturedState = null
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: makeGame({ speaker: players[0].id }) }),
            }),
          }),
          update: vi.fn().mockImplementation((state) => {
            capturedState = state.draft_state
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: players }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [...makeBlue(40), ...makeRed(20)] }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, mode: 'milty' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.phase).toBe('slice-pick')
    expect(data.player_count).toBe(6)

    const slices = capturedState.slices
    expect(slices).toHaveLength(6)
    for (const s of slices) {
      expect(s.tiles).toHaveLength(5) // 3B + 2R
      expect(s.claimed_by).toBeNull()
    }
    const scores = slices.map((s) => s.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(2)
  })
})
