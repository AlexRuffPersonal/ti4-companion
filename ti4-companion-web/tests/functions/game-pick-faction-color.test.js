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
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-pick-faction-color', body)

// Returns a membership check mock (caller is or isn't in the game)
function membershipMock(found = true) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: found ? { id: PLAYER_ID } : null }),
        }),
      }),
    }),
  }
}

// Returns a "taken" check mock (faction/colour is or isn't taken by another player)
function takenMock(taken = false) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: taken ? { id: 'other-player' } : null }),
          }),
        }),
      }),
    }),
  }
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-pick-faction-color/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-pick-faction-color', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    db.from.mockReturnValue(membershipMock())
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when colour is invalid', async () => {
    db.from.mockReturnValue(membershipMock())
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'rainbow' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/colour/)
  })

  it('returns 403 when caller is not in the game', async () => {
    db.from.mockReturnValue(membershipMock(false))
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/not in this game/i)
  })

  it('returns 409 when faction is already taken by another player', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)   // caller is in game
      if (callCount === 2) return takenMock(true)         // faction taken
      return takenMock(false)
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction already taken/i)
  })

  it('returns 409 when colour is already taken by another player', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)   // caller is in game
      if (callCount === 2) return takenMock(false)        // faction free
      return takenMock(true)                              // colour taken
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/colour already taken/i)
  })

  it('returns 200 on valid pick', async () => {
    let callCount = 0
    db.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return membershipMock(true)
      if (callCount === 2) return takenMock(false)
      if (callCount === 3) return takenMock(false)
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, faction: 'Arborec', colour: 'green' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
  })
})
