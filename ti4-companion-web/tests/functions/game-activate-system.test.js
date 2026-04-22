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
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-activate-system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let insertMock

function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  playerError = null,
  game = { active_player_id: PLAYER_ID, round: 2 },
  gameError = null,
  activations = [],
  activationError = null,
  insertError = null,
} = {}) {
  insertMock = vi.fn().mockResolvedValue({ error: insertError })
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: activationError }),
            }),
          }),
        }),
        insert: insertMock,
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-activate-system', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: '1,-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when caller is not the active player', async () => {
    mockDb({ game: { active_player_id: 'other-player', round: 2 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the active player/i)
  })

  it('returns 409 when no tactic tokens available', async () => {
    mockDb({
      player: { id: PLAYER_ID, command_tokens: { tactic_total: 1, fleet: 2, strategy: 1 } },
      activations: [{ id: 'a1', system_key: '2,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no tactic tokens/i)
  })

  it('returns 409 when system already activated by caller this round', async () => {
    mockDb({
      activations: [{ id: 'a1', system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('returns 200 and inserts activation row on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(insertMock).toHaveBeenCalledWith({
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      system_key: '1,-1',
      round: 2,
      token_owner_id: PLAYER_ID,
    })
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })
})