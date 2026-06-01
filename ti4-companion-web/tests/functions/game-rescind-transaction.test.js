import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: {
    from: vi.fn(),
    raw: (sql) => ({ _raw: sql }),
  },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-rescind-transaction/index.ts'
import { USER_ID, GAME_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'

const makeRequest = (body) => _makeRequest('game-rescind-transaction', body)

const FROM_PLAYER_ID = 'player1-uuid'
const TO_PLAYER_ID = 'player2-uuid'
const ACTIVE_PLAYER_ID = FROM_PLAYER_ID

function mockDbDefaults() {
  return {
    toPlayer: { id: TO_PLAYER_ID, commodities: 3, trade_goods: 1 },
    transaction: {
      id: 'tx-1',
      from_player_id: FROM_PLAYER_ID,
      to_player_id: TO_PLAYER_ID,
      status: 'pending',
      active_player_id: null,
      items: {
        offer: { commodities: 1, trade_goods: 0, note_ids: [] },
        request: { commodities: 0, trade_goods: 0, note_ids: [] },
      },
    },
    fromPlayer: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2 },
    game: { active_player_id: ACTIVE_PLAYER_ID, phase: 'action' },
  }
}

function mockDb(overrides = {}) {
  const defaults = mockDbDefaults()
  const config = { ...defaults, ...overrides }

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn((field, value) => {
            if (field === 'game_id') {
              return {
                eq: vi.fn((field2, value2) => {
                  if (field2 === 'user_id') {
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({ data: config.fromPlayer, error: null }),
                    }
                  }
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({ data: config.toPlayer, error: null }),
                  }
                }),
              }
            }
            if (field === 'id') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: config.fromPlayer, error: null }),
              }
            }
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: config.toPlayer, error: null }),
            }
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'game_transactions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.transaction, error: null }),
            // For the query that looks for existing confirmed transactions
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.game, error: null }),
          }),
        }),
      }
    }

    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(FROM_PLAYER_ID)
})

describe('game-rescind-transaction', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when current player not found', async () => {
    mockDb({ fromPlayer: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when transaction not found', async () => {
    mockDb({ transaction: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not from_player_id', async () => {
    mockDb({
      fromPlayer: { id: 'other-player-uuid', commodities: 3, trade_goods: 1 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when transaction status is not pending', async () => {
    mockDb({
      transaction: {
        id: 'tx-1',
        from_player_id: FROM_PLAYER_ID,
        to_player_id: TO_PLAYER_ID,
        status: 'confirmed',
        active_player_id: null,
        items: {
          offer: { commodities: 1, trade_goods: 0, note_ids: [] },
          request: { commodities: 0, trade_goods: 0, note_ids: [] },
        },
      },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(409)
  })

  it('sets status=rescinded on success', async () => {
    const updateMock = vi.fn().mockResolvedValue({ error: null })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field, value) => {
              if (field === 'game_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2 },
                      error: null
                    }),
                  }),
                }
              }
              if (field === 'id') {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2 },
                    error: null
                  }),
                }
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((field, value) => {
              // First eq call returns maybeSingle and eq chain
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'tx-1',
                    from_player_id: FROM_PLAYER_ID,
                    to_player_id: TO_PLAYER_ID,
                    status: 'pending',
                    active_player_id: null,
                    items: {
                      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
                      request: { commodities: 0, trade_goods: 0, note_ids: [] },
                    },
                  },
                  error: null,
                }),
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }
            }),
          }),
          update: updateMock.mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active_player_id: ACTIVE_PLAYER_ID, phase: 'action' },
                error: null
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          update: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
      }
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalled()
    const updateCall = updateMock.mock.calls[updateMock.mock.calls.length - 1][0]
    expect(updateCall.status).toBe('rescinded')
  })
})