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
const SPEAKER_ID = 'speaker-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const READY_PLAYERS = [
  { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
  { id: 'p2', faction: 'Letnev', colour: 'red', display_name: 'Bob' },
]

function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID },
  gameError = null,
  players = READY_PLAYERS,
  playersError = null,
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
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
      }
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-start/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-start', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host', async () => {
    requireAuth.mockResolvedValue('other-user')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/only the host/i)
  })

  it('returns 409 when speaker is not set', async () => {
    mockDb({ gameData: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/speaker must be set/i)
  })

  it('returns 409 when a player has not picked faction or colour', async () => {
    mockDb({
      players: [
        { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
        { id: 'p2', faction: null, colour: null, display_name: 'Bob' },
      ],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Bob/i)
  })

  it('returns 200 and sets status to active when all conditions are met', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(true)
  })

  it('returns 500 when db update fails', async () => {
    mockDb({ updateError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })
})
