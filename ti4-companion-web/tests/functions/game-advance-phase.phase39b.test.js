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
  applyStatusPhaseLaws: vi.fn(),
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn(),
  getActiveNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyStatusPhaseLaws } from '../../../supabase/functions/_shared/lawEffects.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_A = 'player-a'
const PLAYER_B = 'player-b'
const NOTE_ID = 'note-instance-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-advance-phase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// ─── STATUS PHASE MOCK ────────────────────────────────────────────────────────

function makeStatusMock({ players, factionCap = 3 } = {}) {
  const gamePlayersUpdateCalls = []
  const gamePlayersUpdateEqArgs = []

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
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('action_card_count')) {
            return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
          }
          // holder trade_goods select
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { trade_goods: 0 }, error: null }),
            }),
          }
        }),
        update: vi.fn().mockImplementation((payload) => {
          gamePlayersUpdateCalls.push(payload)
          const eqFn = vi.fn().mockImplementation((col, val) => {
            gamePlayersUpdateEqArgs.push({ col, val, payload })
            return Promise.resolve({ error: null })
          })
          return { eq: eqFn }
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
    if (table === 'factions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { commodities: factionCap }, error: null }),
          }),
        }),
      }
    }
    return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
  })

  return { gamePlayersUpdateCalls, gamePlayersUpdateEqArgs }
}

// ─── STRATEGY PHASE MOCK ──────────────────────────────────────────────────────

function makeStrategyMock({ players = [], strategyCardPlayers = [] } = {}) {
  const gamesUpdateCalls = []

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
          // strategy_card select for first player
          return {
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: strategyCardPlayers, error: null }),
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
  getHeldNotes.mockResolvedValue([])
  getActiveNotes.mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  })
  returnNote.mockResolvedValue(undefined)
})

// ─── TRADE AGREEMENT — STATUS PHASE ──────────────────────────────────────────

describe('game-advance-phase — Phase 39b Trade Agreement', () => {
  it('Trade Agreement held with owner being replenished: commodities transferred to holder, note returned', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: 'The Arborec',
        commodities: 2,
        trade_goods: 0,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    // PLAYER_B holds the Trade Agreement; PLAYER_A is the owner (being replenished)
    getHeldNotes.mockResolvedValue([
      { instanceId: NOTE_ID, ownerPlayerId: PLAYER_A, holderPlayerId: PLAYER_B },
    ])

    // Mock holder's trade_goods select
    let holderTgQueried = false
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
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            // holder trade_goods select
            holderTgQueried = true
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trade_goods: 5 }, error: null }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // getHeldNotes called for Trade Agreement
    expect(getHeldNotes).toHaveBeenCalledWith(GAME_ID, 'Trade Agreement', expect.anything())

    // Holder's trade_goods were queried
    expect(holderTgQueried).toBe(true)

    // returnNote called with note instance and owner
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, PLAYER_A, expect.anything())
  })

  it('Trade Agreement held but owner is not the player being replenished: no transfer', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: 'The Arborec',
        commodities: 2,
        trade_goods: 0,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    // Note owner is PLAYER_B (not being replenished in this mock with single player)
    getHeldNotes.mockResolvedValue([
      { instanceId: NOTE_ID, ownerPlayerId: PLAYER_B, holderPlayerId: PLAYER_A },
    ])

    const updateCalls = []
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
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('action_card_count')) {
              return { eq: vi.fn().mockResolvedValue({ data: players, error: null }) }
            }
            return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { trade_goods: 0 }, error: null }) }) }
          }),
          update: vi.fn().mockImplementation((payload) => {
            updateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // returnNote should NOT be called for Trade Agreement (owner not replenished)
    expect(returnNote).not.toHaveBeenCalledWith(NOTE_ID, expect.anything(), expect.anything())
  })

  it('No Trade Agreement held: no transfer, returnNote not called for Trade Agreement', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: 'The Arborec',
        commodities: 2,
        trade_goods: 0,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    getHeldNotes.mockResolvedValue([])

    makeStatusMock({ players, factionCap: 3 })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    // No notes to return
    expect(returnNote).not.toHaveBeenCalled()
  })
})

// ─── GIFT OF PRESCIENCE — STRATEGY PHASE ─────────────────────────────────────

describe('game-advance-phase — Phase 39b Gift of Prescience strategy phase', () => {
  it('Gift of Prescience in_play: holder set as active player (initiative 0)', async () => {
    getHeldNotes.mockResolvedValue([]) // Scepter of Dominion: none
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_ID, ownerPlayerId: PLAYER_A, holderPlayerId: PLAYER_B }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const { gamesUpdateCalls } = makeStrategyMock({
      players: [{ id: PLAYER_A, technologies: [] }, { id: PLAYER_B, technologies: [] }],
      strategyCardPlayers: [{ id: PLAYER_A, strategy_card: 1 }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // active_player_id should be the Gift of Prescience holder (PLAYER_B), not PLAYER_A
    const phaseUpdate = gamesUpdateCalls.find(c => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBe(PLAYER_B)
  })

  it('No Gift of Prescience in_play: active player determined by lowest strategy_card', async () => {
    getHeldNotes.mockResolvedValue([]) // Scepter of Dominion: none
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    const { gamesUpdateCalls } = makeStrategyMock({
      players: [{ id: PLAYER_A, technologies: [] }],
      strategyCardPlayers: [{ id: PLAYER_A, strategy_card: 1 }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    const phaseUpdate = gamesUpdateCalls.find(c => c.phase === 'action')
    expect(phaseUpdate).toBeDefined()
    expect(phaseUpdate.active_player_id).toBe(PLAYER_A)
  })
})

// ─── GIFT OF PRESCIENCE — STATUS PHASE END ───────────────────────────────────

describe('game-advance-phase — Phase 39b Gift of Prescience status phase end', () => {
  it('Gift of Prescience in_play at status phase end: note is returned', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: 'The Arborec',
        commodities: 2,
        trade_goods: 0,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    getHeldNotes.mockResolvedValue([]) // No Trade Agreement
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: NOTE_ID, ownerPlayerId: PLAYER_A, holderPlayerId: PLAYER_B }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players, factionCap: 3 })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)

    // returnNote called for Gift of Prescience note, returning to owner
    expect(returnNote).toHaveBeenCalledWith(NOTE_ID, PLAYER_A, expect.anything())
  })

  it('No Gift of Prescience in_play at status phase end: returnNote not called', async () => {
    const players = [
      {
        id: PLAYER_A,
        faction: 'The Arborec',
        commodities: 2,
        trade_goods: 0,
        technologies: [],
        action_card_count: 0,
        command_tokens: { tactic_total: 3, fleet: 3, strategy: 0 },
      },
    ]
    getHeldNotes.mockResolvedValue([])
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    makeStatusMock({ players, factionCap: 3 })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalled()
  })
})
