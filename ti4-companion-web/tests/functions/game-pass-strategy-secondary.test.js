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
import { handler } from '../../../supabase/functions/game-pass-strategy-secondary/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-pass-strategy-secondary', body)

const PLAY_ID = 'play-uuid'
const RESPONSE_ID = 'response-uuid'

function mockDb({
  player = { id: PLAYER_ID },
  play = { id: PLAY_ID, played_by_player_id: 'other-player' },
  nextResponse = { id: RESPONSE_ID, player_id: PLAYER_ID },
  pendingCount = 0,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: play, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockImplementation((cols, opts) => {
          if (opts?.count === 'exact') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: pendingCount, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: nextResponse, error: null }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    return nullSafeChain()
  })
}

describe('game-pass-strategy-secondary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ play_id: PLAY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when play_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when no active play', async () => {
    mockDb({ play: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when caller is the play owner', async () => {
    mockDb({ play: { id: PLAY_ID, played_by_player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when not the next pending responder', async () => {
    mockDb({ nextResponse: { id: RESPONSE_ID, player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with passed=true and play_complete=false when others still pending', async () => {
    mockDb({ pendingCount: 1 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.passed).toBe(true)
    expect(body.play_complete).toBe(false)
  })

  it('returns 200 with play_complete=true when this was the last pending response', async () => {
    mockDb({ pendingCount: 0 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.passed).toBe(true)
    expect(body.play_complete).toBe(true)
  })
})
