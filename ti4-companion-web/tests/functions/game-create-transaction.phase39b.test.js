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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-create-transaction/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const FROM_PLAYER_ID = 'player1-uuid'
const TO_PLAYER_ID = 'player2-uuid'
const FROM_FACTION = 'arborec'
const TO_FACTION = 'sol'
// Non-adjacent home system positions
const FROM_HOME_KEY = '2,-1'
const TO_HOME_KEY = '-2,1'
const FROM_TILE_ID = 'tile-arborec'
const TO_TILE_ID = 'tile-sol'

function makeRequest(body) {
  return new Request('http://localhost/game-create-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

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

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-create-transaction phase39b — Trade Convoys neighbor bypass', () => {
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
