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

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-update-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby' },
  gameError = null,
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-update-settings/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-update-settings', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ vp_goal: 14 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when game is not in lobby', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'active' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 14 }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when vp_goal is not a positive integer', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: -1 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/vp_goal/)
  })

  it('returns 400 when permissions_mode is invalid', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, permissions_mode: 'invalid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/permissions_mode/)
  })

  it('returns 200 on valid update', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 12, permissions_mode: 'all' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })

  it('returns 500 when db update fails', async () => {
    mockDb({ updateError: { message: 'db error' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, vp_goal: 12 }))
    expect(res.status).toBe(500)
  })
})
