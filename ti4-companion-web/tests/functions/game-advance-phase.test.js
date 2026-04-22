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
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ game = { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false }, updateError = null } = {}) {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: updateMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
  })
  return { updateMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-advance-phase — agenda_unlocked patch', () => {
  it('advances status → strategy when agenda_unlocked=false', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('strategy')
  })

  it('advances status → agenda when agenda_unlocked=true', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const phaseCall = updateMock.mock.calls.find(call => call[0]?.phase !== undefined)
    expect(phaseCall[0].phase).toBe('agenda')
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not host', async () => {
    mockDb({ game: { id: GAME_ID, host_user_id: 'other-host', phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })
})