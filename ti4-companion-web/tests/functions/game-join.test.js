import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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
import { USER_ID, GAME_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-join', body)

function mockDb({
  gameData = { id: GAME_ID, status: 'lobby' },
  gameError = null,
  existingPlayer = null,   // null = not already in game
  playerCount = 1,
  countError = null,
  profileData = { display_name: 'Test User' },
  playerError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols, opts) => {
          if (opts?.count === 'exact') {
            // count query: .select('*', {count:'exact',head:true}).eq('game_id',...) → {count, error}
            return {
              eq: vi.fn().mockResolvedValue({ count: playerCount, error: countError }),
            }
          }
          // membership check: .select('id').eq('game_id',...).eq('user_id',...).maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingPlayer }),
              }),
            }),
          }
        }),
        insert: vi.fn().mockResolvedValue({ error: playerError }),
      }
    }
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: profileData }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-join/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-join', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when code is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/'code' must be a non-empty string/)
  })

  it('returns 404 when game code does not exist', async () => {
    mockDb({ gameData: null })
    const res = await handler(makeRequest({ code: 'XXXXXX' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 409 when game has already started', async () => {
    mockDb({ gameData: { id: GAME_ID, status: 'active' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already started/i)
  })

  it('returns 200 idempotently when player is already in the game', async () => {
    mockDb({ existingPlayer: { id: 'player-uuid' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.game_id).toBe(GAME_ID)
  })

  it('returns 409 when game is full (8 players)', async () => {
    mockDb({ playerCount: 8 })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/full/i)
  })

  it('returns 200 with game_id and code on successful join', async () => {
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.game_id).toBe(GAME_ID)
    expect(body.code).toBe('ABC123')
  })

  it('returns 500 when insert fails', async () => {
    mockDb({ playerError: { message: 'constraint' } })
    const res = await handler(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(500)
  })
})
