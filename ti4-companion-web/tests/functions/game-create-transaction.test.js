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
  EVT_CREATE_TRANSACTION: 'create_transaction',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-create-transaction/index.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-create-transaction', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const FROM_PLAYER_ID = 'player1-uuid'
const TO_PLAYER_ID = 'player2-uuid'

function mockDb({
  currentPlayer = { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2 },
  currentPlayerError = null,
  toPlayer = { id: TO_PLAYER_ID },
  toPlayerError = null,
  game = { id: GAME_ID, current_vote_sequence: 1 },
  gameError = null,
  heldNotes = [{ id: 'note-1', held_by_player_id: FROM_PLAYER_ID, state: 'held' }],
  heldNotesError = null,
  existingTx = null,
  existingTxError = null,
  insertError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      if (currentPlayerError || toPlayerError) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: currentPlayerError ? null : currentPlayer, error: currentPlayerError }),
                maybeSingle: vi.fn().mockResolvedValue({ data: toPlayerError ? null : toPlayer, error: toPlayerError }),
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: currentPlayer, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: toPlayer, error: null }),
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
    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: heldNotes, error: heldNotesError }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_transactions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: existingTx ? [existingTx] : [], error: existingTxError }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: insertError }),
      }
    }
    return nullSafeChain()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-create-transaction', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when to_player_id is missing', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when caller is not in the game', async () => {
    mockDb({ currentPlayerError: null, currentPlayer: null })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when to_player_id equals from_player_id', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: FROM_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when offer has more than 1 note', async () => {
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 0, trade_goods: 0, note_ids: ['n1', 'n2'] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when caller has insufficient commodities', async () => {
    mockDb({ currentPlayer: { id: FROM_PLAYER_ID, commodities: 1, trade_goods: 2 } })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 5, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when offered note is not held by caller', async () => {
    mockDb({ heldNotes: [] })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 0, trade_goods: 0, note_ids: ['note-1'] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(409)
  })

  it('writes game_transactions row with status=pending on success', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    db.from.mockImplementation((table) => {
      if (table === 'game_transactions') {
        return {
          insert: insertMock,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: FROM_PLAYER_ID, commodities: 5, trade_goods: 2 }, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: TO_PLAYER_ID }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, current_vote_sequence: 1 }, error: null }),
            }),
          }),
        }
      }
      return nullSafeChain()
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(200)
    expect(insertMock).toHaveBeenCalledOnce()
    const row = insertMock.mock.calls[0][0]
    expect(row.status).toBe('pending')
    expect(row.from_player_id).toBe(FROM_PLAYER_ID)
    expect(row.to_player_id).toBe(TO_PLAYER_ID)
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, to_player_id: TO_PLAYER_ID, offer: { commodities: 1, trade_goods: 0, note_ids: [] }, request: { commodities: 0, trade_goods: 1, note_ids: [] } }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'create_transaction' }))
  })
})

describe('phase 39b — Trade Convoys neighbor bypass', () => {
  // Non-adjacent home system positions
  const FROM_HOME_KEY = '2,-1'
  const TO_HOME_KEY = '-2,1'
  const FROM_TILE_ID = 'tile-arborec'
  const TO_TILE_ID = 'tile-sol'
  const FROM_FACTION = 'arborec'
  const TO_FACTION = 'sol'

  function buildMock({ tradeConvoysActive = true } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: FROM_PLAYER_ID, commodities: 3, trade_goods: 1, faction: FROM_FACTION },
                  error: null,
                }),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: TO_PLAYER_ID, faction: TO_FACTION },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  current_vote_sequence: 1,
                  map_tiles: {
                    [FROM_HOME_KEY]: { tile_id: FROM_TILE_ID, tile_number: '5' },
                    [TO_HOME_KEY]: { tile_id: TO_TILE_ID, tile_number: '8' },
                  },
                },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field, value) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: value === FROM_FACTION ? FROM_TILE_ID : TO_TILE_ID },
                error: null,
              }),
            })),
          }),
        }
      }

      if (table === 'game_player_promissory_notes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: tradeConvoysActive
                  ? [{
                      id: 'gpn-tc-1',
                      held_by_player_id: FROM_PLAYER_ID,
                      owner_player_id: TO_PLAYER_ID,
                      promissory_notes: { name: 'Trade Convoys' },
                    }]
                  : [],
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'game_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }

      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('GIVEN Trade Convoys in_play for initiating player EXPECT non-neighbor transaction allowed', async () => {
    buildMock({ tradeConvoysActive: true })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(true)
  })

  it('GIVEN Trade Convoys not in_play EXPECT non-neighbor transaction blocked', async () => {
    buildMock({ tradeConvoysActive: false })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      to_player_id: TO_PLAYER_ID,
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 0, note_ids: [] },
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not neighbors/i)
  })
})
