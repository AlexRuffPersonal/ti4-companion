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
const makeRequest = (body = {}) => _makeRequest('game-create', body)

// Sets up db.from to return appropriate mocks for each table
function mockDb({
  profileData = { display_name: 'Test User' },
  profileError = null,
  gameData = { id: GAME_ID, code: 'ABC123' },
  gameError = null,
  playerError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData, error: profileError }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }), // no collision
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        insert: vi.fn().mockResolvedValue({ error: playerError }),
      }
    }
    return nullSafeChain()
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-create/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('game-create', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('returns 204 for OPTIONS preflight', async () => {
    const req = new Request('http://localhost/game-create', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 200 with code and game_id on success', async () => {
    requireAuth.mockResolvedValue(USER_ID)
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('ABC123')
    expect(body.game_id).toBe(GAME_ID)
  })

  it('returns 500 when game insert fails', async () => {
    requireAuth.mockResolvedValue(USER_ID)
    mockDb({ gameError: { message: 'unique violation' } })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/failed to create game/i)
  })

  it('returns 500 when game_players insert fails', async () => {
    requireAuth.mockResolvedValue(USER_ID)
    mockDb({ playerError: { message: 'constraint violation' } })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/failed to add host player/i)
  })

  it('returns 500 when profile fetch fails', async () => {
    requireAuth.mockResolvedValue(USER_ID)
    mockDb({ profileError: { message: 'relation does not exist' } })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/could not fetch profile/i)
  })
})
