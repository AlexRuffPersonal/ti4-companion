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
import { handler } from '../../../supabase/functions/game-status-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-status-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const PASSED_PLAYERS = [
  { id: 'p1', passed: true, command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } },
  { id: 'p2', passed: true, command_tokens: { tactic_total: 1, fleet: 4, strategy: 2 } },
]

function mockDb({
  game = { id: GAME_ID, host_user_id: HOST_ID, permissions_mode: 'host', phase: 'status', round: 2 },
  gameError = null,
  players = PASSED_PLAYERS,
  playersError = null,
  readyPlanetsError = null,
  repairUnitsError = null,
  deleteActivationsError = null,
  updatePlayerError = null,
  updateGameError = null,
} = {}) {
  const updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })
  const updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updatePlayerError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
        update: updateGameMock,
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: readyPlanetsError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: repairUnitsError }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: deleteActivationsError }),
        }),
      }
    }
  })
  return { updateGameMock, updatePlayerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(HOST_ID)
})

describe('game-status-phase', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the host (host mode)', async () => {
    requireAuth.mockResolvedValue('not-the-host')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('allows non-host when permissions_mode is all', async () => {
    mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, permissions_mode: 'all', phase: 'status', round: 2 } })
    requireAuth.mockResolvedValue('any-player')
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('returns 409 when a player has not passed', async () => {
    mockDb({ players: [
      { id: 'p1', passed: true,  command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } },
      { id: 'p2', passed: false, command_tokens: { tactic_total: 1, fleet: 4, strategy: 2 } },
    ]})
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not all players have passed/i)
  })

  it('returns 200 on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
  })

  it('grants each player +2 tactic tokens', async () => {
    const { updatePlayerMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    // called once per player with tactic incremented
    const calls = updatePlayerMock.mock.calls
    const p1Call = calls.find(c => c[1] === 'p1' || (c[0].command_tokens?.tactic_total === 4))
    expect(calls.some(c => c[0].command_tokens?.tactic_total === 4)).toBe(true) // p1: 2+2
    expect(calls.some(c => c[0].command_tokens?.tactic_total === 3)).toBe(true) // p2: 1+2
  })

  it('sets tokens_redistributed = false for all players', async () => {
    const { updatePlayerMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    const allCalls = updatePlayerMock.mock.calls
    allCalls.forEach(call => {
      expect(call[0]).toMatchObject({ tokens_redistributed: false, passed: false })
    })
  })

  it('increments round and sets phase to strategy', async () => {
    const { updateGameMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledOnce()
    expect(updateGameMock.mock.calls[0][0]).toMatchObject({ round: 3, phase: 'strategy' })
  })

  it('does not change speaker_player_id', async () => {
    const { updateGameMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID }))
    const updateArg = updateGameMock.mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('speaker_player_id')
  })
})