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
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_CONFIRM_TRANSACTION: 'confirm_transaction',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-confirm-transaction/index.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-confirm-transaction', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
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
                      maybeSingle: vi.fn().mockResolvedValue({ data: config.toPlayer, error: null }),
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
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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

    return nullSafeChain()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(TO_PLAYER_ID)
})

describe('game-confirm-transaction', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when toPlayer not found', async () => {
    mockDb({ toPlayer: null })
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

  it('returns 403 when caller is not to_player_id', async () => {
    mockDb({
      toPlayer: { id: 'other-player-uuid', commodities: 3, trade_goods: 1 },
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

  it('returns 409 when neither party is active player', async () => {
    mockDb({ game: { active_player_id: 'other-player-uuid', phase: 'action' } })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when recipient has insufficient commodities for request', async () => {
    mockDb({
      transaction: {
        id: 'tx-1',
        from_player_id: FROM_PLAYER_ID,
        to_player_id: TO_PLAYER_ID,
        status: 'pending',
        active_player_id: null,
        items: {
          offer: { commodities: 1, trade_goods: 0, note_ids: [] },
          request: { commodities: 5, trade_goods: 0, note_ids: [] },
        },
      },
      toPlayer: { id: TO_PLAYER_ID, commodities: 2, trade_goods: 1 },
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(409)
  })

  it('completes transaction successfully', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmed).toBe(true)
  })

  it('GIVEN Support For The Throne note EXPECT state=in_play and recipient vp incremented', async () => {
    const noteId = 'note-sftt'
    const noteRowId = 'gpn-sftt'
    const recipientVpBefore = 3
    const vpUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const noteUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field, value) => {
              if (field === 'game_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: TO_PLAYER_ID, commodities: 3, trade_goods: 1 },
                      error: null,
                    }),
                  }),
                }
              }
              if (field === 'id') {
                // May be called for fromPlayer OR recipientPlayer vp fetch
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: value, commodities: 5, trade_goods: 2, vp: recipientVpBefore },
                    error: null,
                  }),
                }
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
            }),
          }),
          update: vpUpdateMock,
        }
      }
      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tx-sftt',
                  from_player_id: FROM_PLAYER_ID,
                  to_player_id: TO_PLAYER_ID,
                  status: 'pending',
                  active_player_id: null,
                  items: {
                    offer: { commodities: 0, trade_goods: 0, note_ids: [noteId] },
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
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active_player_id: ACTIVE_PLAYER_ID, phase: 'action' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: noteRowId, state: 'held', held_by_player_id: FROM_PLAYER_ID, note_id: 'ref-sftt' },
                error: null,
              }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          update: noteUpdateMock,
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { name: 'Support For The Throne' },
                error: null,
              }),
            }),
          }),
        }
      }
      return nullSafeChain()
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-sftt' }))
    expect(res.status).toBe(200)

    // Note should be updated to in_play
    const noteUpdateCall = noteUpdateMock.mock.calls.find(call => call[0]?.state === 'in_play')
    expect(noteUpdateCall).toBeDefined()
    expect(noteUpdateCall[0].state).toBe('in_play')
    expect(noteUpdateCall[0].held_by_player_id).toBe(TO_PLAYER_ID)

    // VP should be incremented for recipient
    const vpCall = vpUpdateMock.mock.calls.find(call => call[0]?.vp === recipientVpBefore + 1)
    expect(vpCall).toBeDefined()
    expect(vpCall[0].vp).toBe(recipientVpBefore + 1)
  })

  it('GIVEN Alliance note EXPECT state=in_play', async () => {
    const noteId = 'note-alliance'
    const noteRowId = 'gpn-alliance'
    const noteUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field) => {
              if (field === 'game_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: TO_PLAYER_ID, commodities: 3, trade_goods: 1 },
                      error: null,
                    }),
                  }),
                }
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2, vp: 2 },
                  error: null,
                }),
              }
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tx-alliance',
                  from_player_id: FROM_PLAYER_ID,
                  to_player_id: TO_PLAYER_ID,
                  status: 'pending',
                  active_player_id: null,
                  items: {
                    offer: { commodities: 0, trade_goods: 0, note_ids: [noteId] },
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
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active_player_id: ACTIVE_PLAYER_ID, phase: 'action' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: noteRowId, state: 'held', held_by_player_id: FROM_PLAYER_ID, note_id: 'ref-alliance' },
                error: null,
              }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          update: noteUpdateMock,
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { name: 'Alliance' },
                error: null,
              }),
            }),
          }),
        }
      }
      return nullSafeChain()
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-alliance' }))
    expect(res.status).toBe(200)

    const noteUpdateCall = noteUpdateMock.mock.calls.find(call => call[0]?.state === 'in_play')
    expect(noteUpdateCall).toBeDefined()
    expect(noteUpdateCall[0].state).toBe('in_play')
  })

  it('GIVEN non-auto-fire note EXPECT state=held', async () => {
    const noteId = 'note-generic'
    const noteRowId = 'gpn-generic'
    const noteUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field) => {
              if (field === 'game_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: TO_PLAYER_ID, commodities: 3, trade_goods: 1 },
                      error: null,
                    }),
                  }),
                }
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2, vp: 2 },
                  error: null,
                }),
              }
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tx-generic',
                  from_player_id: FROM_PLAYER_ID,
                  to_player_id: TO_PLAYER_ID,
                  status: 'pending',
                  active_player_id: null,
                  items: {
                    offer: { commodities: 0, trade_goods: 0, note_ids: [noteId] },
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
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active_player_id: ACTIVE_PLAYER_ID, phase: 'action' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: noteRowId, state: 'held', held_by_player_id: FROM_PLAYER_ID, note_id: 'ref-generic' },
                error: null,
              }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          update: noteUpdateMock,
        }
      }
      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { name: 'Political Favor' },
                error: null,
              }),
            }),
          }),
        }
      }
      return nullSafeChain()
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-generic' }))
    expect(res.status).toBe(200)

    const noteUpdateCall = noteUpdateMock.mock.calls.find(call => call[0]?.state === 'held')
    expect(noteUpdateCall).toBeDefined()
    expect(noteUpdateCall[0].state).toBe('held')
    expect(noteUpdateCall[0].held_by_player_id).toBe(TO_PLAYER_ID)
  })

  it('sets confirmed_at, active_player_id, and status=confirmed on success', async () => {
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
                      data: { id: TO_PLAYER_ID, commodities: 3, trade_goods: 1 },
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
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      return nullSafeChain()
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      transaction_id: 'tx-1',
    }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalled()
    const updateCall = updateMock.mock.calls[updateMock.mock.calls.length - 1][0]
    expect(updateCall.status).toBe('confirmed')
    expect(updateCall.active_player_id).toBe(ACTIVE_PLAYER_ID)
    expect(updateCall.confirmed_at).toBeDefined()
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-1' }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'confirm_transaction' }))
  })
})

describe('phase 39b — Dark Pact enforcement', () => {
  const EMPYREAN_PLAYER_ID = 'empyrean-uuid'
  const HOLDER_PLAYER_ID = 'holder-uuid'

  // Builds a full db.from mock for Dark Pact scenarios.
  // holderIsFromPlayer: if true, HOLDER is from_player and EMPYREAN is to_player (offer.commodities flows holder→owner).
  // offerCommodities: commodities sent from holder to owner (or request.commodities if reversed).
  // ownerCommodityMax: Empyrean's commodity_max.
  // darkPactActive: whether dark pact note is in_play.
  function buildDarkPactMock({ holderIsFromPlayer = true, commoditiesTransferred = 3, ownerCommodityMax = 3, darkPactActive = true, updateMock } = {}) {
    const fromPlayerId = holderIsFromPlayer ? HOLDER_PLAYER_ID : EMPYREAN_PLAYER_ID
    const toPlayerId = holderIsFromPlayer ? EMPYREAN_PLAYER_ID : HOLDER_PLAYER_ID

    const txItems = holderIsFromPlayer
      ? { offer: { commodities: commoditiesTransferred, trade_goods: 0, note_ids: [] }, request: { commodities: 0, trade_goods: 0, note_ids: [] } }
      : { offer: { commodities: 0, trade_goods: 0, note_ids: [] }, request: { commodities: commoditiesTransferred, trade_goods: 0, note_ids: [] } }

    const tgUpdateMock = updateMock ?? vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn((cols) => ({
            eq: vi.fn((field, value) => {
              if (field === 'game_id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: toPlayerId, commodities: 3, trade_goods: 1 },
                      error: null,
                    }),
                  }),
                }
              }
              if (field === 'id') {
                // owner row (commodity_max query) or holder row (trade_goods query)
                if (value === EMPYREAN_PLAYER_ID) {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: EMPYREAN_PLAYER_ID, commodity_max: ownerCommodityMax, trade_goods: 2, commodities: 2 },
                      error: null,
                    }),
                  }
                }
                if (value === HOLDER_PLAYER_ID) {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: HOLDER_PLAYER_ID, commodity_max: 4, trade_goods: 1, commodities: 3 },
                      error: null,
                    }),
                  }
                }
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: value, commodity_max: 3, trade_goods: 0, commodities: 0 },
                    error: null,
                  }),
                }
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
            }),
          })),
          update: tgUpdateMock,
        }
      }

      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tx-dark-pact',
                  from_player_id: fromPlayerId,
                  to_player_id: toPlayerId,
                  status: 'pending',
                  active_player_id: null,
                  items: txItems,
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
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active_player_id: fromPlayerId, phase: 'action' },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'game_player_promissory_notes') {
        if (!darkPactActive) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'gpn-dark-pact',
                    held_by_player_id: HOLDER_PLAYER_ID,
                    owner_player_id: EMPYREAN_PLAYER_ID,
                    promissory_notes: { name: 'Dark Pact' },
                  },
                ],
                error: null,
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      if (table === 'promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }

      return nullSafeChain()
    })

    return tgUpdateMock
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GIVEN Dark Pact in_play and holder sends max commodities to Empyrean EXPECT both +1 TG', async () => {
    requireAuth.mockResolvedValue(EMPYREAN_PLAYER_ID)
    const tgUpdateMock = buildDarkPactMock({
      holderIsFromPlayer: true,
      commoditiesTransferred: 3,
      ownerCommodityMax: 3,
      darkPactActive: true,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-dark-pact' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.confirmed).toBe(true)

    // Dark Pact bonus updates only set trade_goods (no commodities key), unlike normal trade steps.
    // owner mock TG = 2, so bonus update = { trade_goods: 3 }
    // holder mock TG = 1, so bonus update = { trade_goods: 2 }
    const tgCalls = tgUpdateMock.mock.calls.map(call => call[0])
    const bonusUpdateToOwner = tgCalls.find(c => c?.trade_goods === 3 && !('commodities' in c))
    const bonusUpdateToHolder = tgCalls.find(c => c?.trade_goods === 2 && !('commodities' in c))
    expect(bonusUpdateToOwner).toBeDefined()
    expect(bonusUpdateToHolder).toBeDefined()
  })

  it('GIVEN Dark Pact in_play and holder sends below max commodities EXPECT no TG bonus', async () => {
    requireAuth.mockResolvedValue(EMPYREAN_PLAYER_ID)
    const tgUpdateMock = buildDarkPactMock({
      holderIsFromPlayer: true,
      commoditiesTransferred: 2,
      ownerCommodityMax: 3,
      darkPactActive: true,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-dark-pact' }))
    expect(res.status).toBe(200)

    // Dark Pact bonus updates only set trade_goods (no commodities key). No bonus should appear.
    const tgCalls = tgUpdateMock.mock.calls.map(call => call[0])
    const bonusUpdate = tgCalls.find(c => !('commodities' in c) && 'trade_goods' in c)
    expect(bonusUpdate).toBeUndefined()
  })

  it('GIVEN Dark Pact not in_play EXPECT no TG bonus', async () => {
    requireAuth.mockResolvedValue(EMPYREAN_PLAYER_ID)
    const tgUpdateMock = buildDarkPactMock({
      holderIsFromPlayer: true,
      commoditiesTransferred: 3,
      ownerCommodityMax: 3,
      darkPactActive: false,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx-dark-pact' }))
    expect(res.status).toBe(200)

    // Dark Pact bonus updates only set trade_goods (no commodities key). No bonus should appear.
    const tgCalls = tgUpdateMock.mock.calls.map(call => call[0])
    const bonusUpdate = tgCalls.find(c => !('commodities' in c) && 'trade_goods' in c)
    expect(bonusUpdate).toBeUndefined()
  })
})
