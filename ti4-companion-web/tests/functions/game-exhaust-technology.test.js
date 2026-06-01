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
import { handler } from '../../../supabase/functions/game-exhaust-technology/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-exhaust-technology', body)

const EXHAUSTABLE_TECH = 'Graviton Laser System'
const NON_EXHAUSTABLE_TECH = 'Neural Motivator'

function mockDb({
  player = { id: PLAYER_ID, technologies: [EXHAUSTABLE_TECH], exhausted_technologies: [] },
  updateError = null,
} = {}) {
  buildDbMock(db, {
    game_players: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      }),
    }),
  })
}

describe('game-exhaust-technology', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when technology_name is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when technology not owned by player', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [], exhausted_technologies: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when technology is owned but not exhaustable', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [NON_EXHAUSTABLE_TECH], exhausted_technologies: [] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: NON_EXHAUSTABLE_TECH }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when technology is already exhausted', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [EXHAUSTABLE_TECH], exhausted_technologies: [EXHAUSTABLE_TECH] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with empty object when technology exhausted successfully', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({})
  })

  it('appends technology to exhausted_technologies on success', async () => {
    let capturedUpdate = null
    buildDbMock(db, {
      game_players: () => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: PLAYER_ID, technologies: [EXHAUSTABLE_TECH, 'Bio-Stims'], exhausted_technologies: ['Bio-Stims'] },
                error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((args) => {
          capturedUpdate = args
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }),
    })
    await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(capturedUpdate).toEqual({ exhausted_technologies: ['Bio-Stims', EXHAUSTABLE_TECH] })
  })

  it('returns 500 when database update fails', async () => {
    mockDb({ updateError: { message: 'DB error' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, technology_name: EXHAUSTABLE_TECH }))
    expect(res.status).toBe(500)
  })
})
