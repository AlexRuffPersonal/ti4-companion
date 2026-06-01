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
import { GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-set-speaker', body)

const HOST_ID = 'host-uuid'

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby' },
  gameError = null,
  targetPlayer = { id: PLAYER_ID },
  playerError = null,
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
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: targetPlayer, error: playerError }),
            }),
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
  await import('../../../supabase/functions/game-set-speaker/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-set-speaker', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when game is not in lobby', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'active' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 404 when game does not exist', async () => {
    mockDb({ gameData: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 500 when game fetch fails', async () => {
    mockDb({ gameError: { message: 'connection error' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(500)
  })

  it('returns 404 when target player is not in the game', async () => {
    mockDb({ targetPlayer: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/player not found/i)
  })

  it('returns 500 when player lookup fails', async () => {
    mockDb({ playerError: { message: 'timeout' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(500)
  })

  it('returns 200 on valid speaker assignment', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })
})
