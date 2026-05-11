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

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_UPDATE_COMMAND_TOKENS: 'update_command_tokens',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-update-command-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ updateError = null } = {}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  })
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
            }),
          }),
        }),
        update: updateMock,
      }
    }
  })
  return { updateMock }
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn }, env: { get: vi.fn(() => 'test') } }
  await import('../../../supabase/functions/game-update-command-tokens/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-update-command-tokens Phase 6', () => {
  it('sets tokens_redistributed = true after updating tokens', async () => {
    const { updateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, tactic_total: 3, fleet: 3, strategy: 2 }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledOnce()
    expect(updateMock.mock.calls[0][0]).toMatchObject({ tokens_redistributed: true })
  })

  it('existing validation: rejects total > 16', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tactic_total: 10, fleet: 4, strategy: 4 }))
    expect(res.status).toBe(400)
  })
})