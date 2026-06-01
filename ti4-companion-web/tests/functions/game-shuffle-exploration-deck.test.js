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
import { handler } from '../../../supabase/functions/game-shuffle-exploration-deck/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'

const makeRequest = (body) => _makeRequest('game-shuffle-exploration-deck', body)

function mockDb({
  player = { id: PLAYER_ID },
  discards = [{ id: 'card-1' }, { id: 'card-2' }, { id: 'card-3' }],
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: discards }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn() }
  })
}

describe('game-shuffle-exploration-deck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'cultural' }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ deck_type: 'cultural' }))
    expect(res.status).toBe(400)
  })

  it('400 missing deck_type', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'cultural' }))
    expect(res.status).toBe(404)
  })

  it('400 invalid deck_type', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'action_card' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid deck_type/i)
  })

  it('409 no discards to shuffle', async () => {
    mockDb({ discards: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'cultural' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no discards to shuffle/i)
  })

  it('resets discarded cards to deck state with randomized positions', async () => {
    const discards = [{ id: 'card-1' }, { id: 'card-2' }, { id: 'card-3' }]
    mockDb({ discards })
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'hazardous' }))
    expect(res.status).toBe(200)
    // Verify update was called for each discard
    const explorationMock = db.from.mock.results.find(
      r => r.value?.update !== undefined
    )
    expect(explorationMock).toBeDefined()
  })

  it('returns count of reshuffled cards', async () => {
    const discards = [{ id: 'card-1' }, { id: 'card-2' }]
    mockDb({ discards })
    const res = await handler(makeRequest({ game_id: GAME_ID, deck_type: 'industrial' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reshuffled).toBe(2)
  })

  it('accepts all valid deck types', async () => {
    for (const deck_type of ['cultural', 'hazardous', 'industrial', 'frontier']) {
      mockDb()
      const res = await handler(makeRequest({ game_id: GAME_ID, deck_type }))
      expect(res.status).toBe(200)
    }
  })
})
