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
  EVT_ADVANCE_PHASE: 'advance_phase',
}))

vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  applyStatusPhaseLaws: vi.fn(async (_db, _gameId, updates) => updates),
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn(),
  getActiveNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { applyStatusPhaseLaws } from '../../../supabase/functions/_shared/lawEffects.ts'
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_OWNER = 'player-owner'
const PLAYER_HOLDER = 'player-holder'
const NOTE_INSTANCE = 'note-instance-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// ─── STATUS PHASE MOCK ────────────────────────────────────────────────────────

function makeStatusMock({ players, gamePlayersUpdateCalls = [], gamesUpdateCalls = [] } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 1, agenda_unlocked: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          gamesUpdateCalls.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('action_card_count')) {
            return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
          }
          return {
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockImplementation((payload) => {
          gamePlayersUpdateCalls.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'factions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: 3 }, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'game_player_legendary_cards') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    if (table === 'game_player_units') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
  })

  return { gamePlayersUpdateCalls, gamesUpdateCalls }
}

// ─── STRATEGY PHASE MOCK ──────────────────────────────────────────────────────

function makeStrategyMock({ players = [], gamesUpdateCalls = [] } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'strategy', round: 1, agenda_unlocked: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          gamesUpdateCalls.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('technologies') && !cols.includes('strategy_card')) {
            return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
          }
          return {
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
  })

  return { gamesUpdateCalls }
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(HOST_ID)
  applyStatusPhaseLaws.mockImplementation(async (_db, _gameId, updates) => updates)
  // Default: no held notes, no active notes
  getHeldNotes.mockResolvedValue([])
  getActiveNotes.mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  })
  returnNote.mockResolvedValue(undefined)
})

// ─── TRADE AGREEMENT ─────────────────────────────────────────────────────────

describe('game-advance-phase — Phase 39b Trade Agreement (status phase replenish)', () => {
  it('Trade Agreement held, owner replenished: commodities transferred to holder as trade goods, note returned', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: 'The Barony of Letnev',
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
      {
        id: PLAYER_HOLDER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 2,
      },
    ]

    // Trade Agreement: held by PLAYER_HOLDER, owned by PLAYER_OWNER
    getHeldNotes.mockImplementation(async (_gameId, noteName, _db) => {
      if (noteName === 'Trade Agreement') {
        return [{ instanceId: NOTE_INSTANCE, holderPlayerId: PLAYER_HOLDER, ownerPlayerId: PLAYER_OWNER }]
      }
      return []
    })

    const gamePlayersUpdateCalls = []
    makeStatusMock({ players, gamePlayersUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // Owner commodities set to 0 after transfer
    const ownerZeroUpdate = gamePlayersUpdateCalls.find(
      (c) => c.commodities === 0 && c.commodities !== undefined
    )
    expect(ownerZeroUpdate).toBeDefined()

    // Holder gets trade_goods increased by commodity_max (3 from faction mock)
    const holderTgUpdate = gamePlayersUpdateCalls.find(
      (c) => c.trade_goods !== undefined && c.trade_goods > 0
    )
    expect(holderTgUpdate).toBeDefined()
    expect(holderTgUpdate.trade_goods).toBe(5) // 2 existing + 3 commodityMax

    // Note returned to owner
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, PLAYER_OWNER, expect.anything())
  })

  it('Trade Agreement not held: no commodity transfer, no returnNote call for Trade Agreement', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: 'The Barony of Letnev',
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    // No held Trade Agreement notes
    getHeldNotes.mockResolvedValue([])

    const gamePlayersUpdateCalls = []
    makeStatusMock({ players, gamePlayersUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // returnNote should NOT be called for Trade Agreement (may be called for Gift of Prescience)
    const tradeAgreementReturnCalls = returnNote.mock.calls.filter(
      ([instanceId]) => instanceId === NOTE_INSTANCE
    )
    expect(tradeAgreementReturnCalls).toHaveLength(0)

    // No trade_goods transfer (no update with positive trade_goods > base)
    const holderTgUpdate = gamePlayersUpdateCalls.find(
      (c) => c.trade_goods !== undefined && c.trade_goods > 0
    )
    expect(holderTgUpdate).toBeUndefined()
  })
})

// ─── GIFT OF PRESCIENCE ───────────────────────────────────────────────────────

describe('game-advance-phase — Phase 39b Gift of Prescience (strategy phase)', () => {
  it('Gift of Prescience in_play: holder gets priority 0, response includes gift_of_prescience_holder_id', async () => {
    const giftHolderPlayerId = PLAYER_HOLDER

    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_INSTANCE, holderPlayerId: giftHolderPlayerId, ownerPlayerId: PLAYER_OWNER }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const gamesUpdateCalls = []
    makeStrategyMock({ players: [], gamesUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // active_player_id set to the Gift of Prescience holder (initiative 0 / first)
    const phaseUpdate = gamesUpdateCalls.find((c) => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBe(giftHolderPlayerId)

    const body = await res.json()
    expect(body.gift_of_prescience_holder_id).toBe(giftHolderPlayerId)
  })

  it('Gift of Prescience not in_play: normal strategy card ordering applies', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const gamesUpdateCalls = []
    makeStrategyMock({ players: [], gamesUpdateCalls })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // active_player_id set to null (no strategy card holders mocked)
    const phaseUpdate = gamesUpdateCalls.find((c) => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBeNull()

    const body = await res.json()
    expect(body.gift_of_prescience_holder_id).toBeUndefined()
  })
})

// ─── GIFT OF PRESCIENCE RETURNED AT STATUS PHASE END ─────────────────────────

describe('game-advance-phase — Phase 39b Gift of Prescience returned at status phase END', () => {
  it('Gift of Prescience in_play during status phase: returnNote called at status phase end', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    // Gift of Prescience is in_play (in_play notes are returned at status phase end)
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_INSTANCE, holderPlayerId: PLAYER_HOLDER, ownerPlayerId: PLAYER_OWNER }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // returnNote called for Gift of Prescience with the owner player
    expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, PLAYER_OWNER, expect.anything())
  })

  it('Gift of Prescience not in_play: returnNote not called for Gift of Prescience', async () => {
    const players = [
      {
        id: PLAYER_OWNER,
        faction: null,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
        commodities: 0,
        trade_goods: 0,
      },
    ]

    // No Gift of Prescience in play
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // returnNote should not be called
    expect(returnNote).not.toHaveBeenCalled()
  })
})
