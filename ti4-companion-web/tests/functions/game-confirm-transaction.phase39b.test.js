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
  EVT_CONFIRM_TRANSACTION: 'confirm_transaction',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-confirm-transaction/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const EMPYREAN_PLAYER_ID = 'empyrean-uuid'
const HOLDER_PLAYER_ID = 'holder-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-confirm-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

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

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })

  return tgUpdateMock
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-confirm-transaction phase39b — Dark Pact enforcement', () => {
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
