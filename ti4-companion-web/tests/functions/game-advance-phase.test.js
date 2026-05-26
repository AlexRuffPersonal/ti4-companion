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
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ADVANCE_PHASE: 'advance_phase',
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  applyStatusPhaseLaws: vi.fn(async (_db, _gameId, updates) => updates),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
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
  const playersUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const legendaryUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
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
        update: playersUpdateMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_legendary_cards') {
      return {
        update: legendaryUpdateMock,
      }
    }
    if (table === 'game_player_units') {
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
  })
  return { updateMock, playersUpdateMock, legendaryUpdateMock }
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

  it('resets vote_prevented for all players when status → agenda (agenda_unlocked=true)', async () => {
    const { playersUpdateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const votePrevCall = playersUpdateMock.mock.calls.find(call => call[0]?.vote_prevented !== undefined)
    expect(votePrevCall).toBeDefined()
    expect(votePrevCall[0].vote_prevented).toBe(false)
  })

  it('resets movement_blocked_systems when status → strategy (agenda_unlocked=false)', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const blockedCall = updateMock.mock.calls.find(call => 'movement_blocked_systems' in (call[0] ?? {}))
    expect(blockedCall).toBeDefined()
    expect(blockedCall[0].movement_blocked_systems).toEqual([])
  })

  it('does NOT reset movement_blocked_systems when status → agenda (agenda_unlocked=true)', async () => {
    const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const blockedCall = updateMock.mock.calls.find(call => 'movement_blocked_systems' in (call[0] ?? {}))
    expect(blockedCall).toBeUndefined()
  })

  it('readies legendary cards during status phase processing', async () => {
    const { legendaryUpdateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const readyCall = legendaryUpdateMock.mock.calls.find(call => call[0]?.status !== undefined)
    expect(readyCall).toBeDefined()
    expect(readyCall[0].status).toBe('readied')
  })

  it('calls logEvent with correct event_type on success', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'advance_phase' }))
  })
})