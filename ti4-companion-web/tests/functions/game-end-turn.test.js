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
import { handler } from '../../../supabase/functions/game-end-turn/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const PLAY_ID = 'play-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-end-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const ALL_PLAYERS = [
  { id: PLAYER_ID, strategy_card: 4, passed: false },
  { id: 'p2', strategy_card: 7, passed: false },
]

function mockDb({
  game = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID },
  callerPlayer = { id: PLAYER_ID },
  activePay = null,
  players = ALL_PLAYERS,
  updateError = null,
} = {}) {
  const updateResponsesMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
  const updatePlaysMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: players, error: null }),
            }),
          }
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: activePay, error: null }),
              }),
            }),
          }),
        }),
        update: updatePlaysMock,
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        update: updateResponsesMock,
      }
    }
    return {}
  })

  return { updateResponsesMock, updatePlaysMock }
}

describe('game-end-turn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 409 when not in action phase', async () => {
    mockDb({ game: { id: GAME_ID, phase: 'strategy', active_player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 403 when not the active player', async () => {
    mockDb({ game: { id: GAME_ID, phase: 'action', active_player_id: 'other' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 and advances to next player when no active strategy play', async () => {
    const { updateResponsesMock, updatePlaysMock } = mockDb({ activePay: null })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(updateResponsesMock).not.toHaveBeenCalled()
    expect(updatePlaysMock).not.toHaveBeenCalled()
  })

  it('auto-passes pending responses and completes play when ending turn with active strategy play', async () => {
    const { updateResponsesMock, updatePlaysMock } = mockDb({ activePay: { id: PLAY_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(updateResponsesMock).toHaveBeenCalled()
    expect(updatePlaysMock).toHaveBeenCalled()
  })
})
