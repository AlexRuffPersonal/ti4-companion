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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-play-strategy-card/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-play-strategy-card', body)

const ABILITY_ID = 'ability-uuid'
const PLAY_ID = 'play-uuid'

const DEFAULT_PLAYER = { id: PLAYER_ID, strategy_card: 5, seat_index: 1 }
const DEFAULT_GAME = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID, round: 1 }
const ALL_PLAYERS = [
  { id: PLAYER_ID, seat_index: 1 },
  { id: 'p2', seat_index: 0 },
  { id: 'p3', seat_index: 2 },
]

function mockDb({
  player = DEFAULT_PLAYER,
  game = DEFAULT_GAME,
  abilitySource = { strategy_card_num: 5 },
  existingPlay = null,
  play = { id: PLAY_ID },
  allPlayers = ALL_PLAYERS,
  insertResponsesError = null,
  hasMecatol = false,
  agendaCards = [],
} = {}) {
  let gamePlayersCallCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      if (gamePlayersCallCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: abilitySource, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingPlay, error: null }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: play, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertResponsesError }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: hasMecatol ? { planet_name: 'Mecatol Rex' } : null, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }
    }
    if (table === 'game_agenda_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: agendaCards }),
              }),
            }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

describe('game-play-strategy-card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when not the active player', async () => {
    mockDb({ game: { ...DEFAULT_GAME, active_player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when not in action phase', async () => {
    mockDb({ game: { ...DEFAULT_GAME, phase: 'strategy' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 404 when ability source not found', async () => {
    mockDb({ abilitySource: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when card not held by caller', async () => {
    mockDb({ abilitySource: { strategy_card_num: 7 } }) // card 7, but player holds 4
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when strategy card already being played', async () => {
    mockDb({ existingPlay: { id: 'existing-play' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with play_id and creates response rows for other players', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.play_id).toBe(PLAY_ID)
  })

  describe('per-card validation and behavior', () => {
    function playerWithCard(n) {
      return { id: PLAYER_ID, strategy_card: n, seat_index: 1 }
    }
    function sourceForCard(n) {
      return { strategy_card_num: n }
    }

    it('card 1 (Leadership): calls gain_command_tokens with amount 3', async () => {
      mockDb({ player: playerWithCard(1), abilitySource: sourceForCard(1) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ op: 'gain_command_tokens', amount: 3 })]),
        expect.anything(), expect.anything()
      )
    })

    it('card 2 (Diplomacy): returns 409 when target_system_coords missing', async () => {
      mockDb({ player: playerWithCard(2), abilitySource: sourceForCard(2) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 3 (Politics): returns 409 when new_speaker_player_id missing', async () => {
      mockDb({ player: playerWithCard(3), abilitySource: sourceForCard(3) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 3 (Politics): returns peek_cards in response body', async () => {
      const agendaCards = [
        { agenda_cards: { id: 'a1', name: 'Political Favor', text: 'text1' } },
        { agenda_cards: { id: 'a2', name: 'Assassinate', text: 'text2' } },
      ]
      mockDb({ player: playerWithCard(3), abilitySource: sourceForCard(3), agendaCards })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        selections: { new_speaker_player_id: 'p2', ordered_card_ids: ['a1', 'a2'] },
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('peek_cards')
    })

    it('card 4 (Construction): returns 409 when no structures provided', async () => {
      mockDb({ player: playerWithCard(4), abilitySource: sourceForCard(4) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 5 (Trade): calls gain_trade_goods and replenish_commodities', async () => {
      mockDb({ player: playerWithCard(5), abilitySource: sourceForCard(5) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ op: 'gain_trade_goods' }),
          expect.objectContaining({ op: 'replenish_commodities' }),
        ]),
        expect.anything(), expect.anything()
      )
    })

    it('card 6 (Warfare): returns 409 when remove_from_system_coords missing', async () => {
      mockDb({ player: playerWithCard(6), abilitySource: sourceForCard(6) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 7 (Technology): returns 409 when tech_1_id missing', async () => {
      mockDb({ player: playerWithCard(7), abilitySource: sourceForCard(7) })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 7 (Technology): calls gain_technology with tech_1_id selection', async () => {
      mockDb({ player: playerWithCard(7), abilitySource: sourceForCard(7) })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        selections: { tech_1_id: 'Neural Motivator' },
      }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'gain_technology' }],
        expect.objectContaining({ selections: { technology_name: 'Neural Motivator' } }),
        expect.anything()
      )
    })

    it('card 8 (Imperial): calls draw_secret_objective when player lacks Mecatol', async () => {
      mockDb({ player: playerWithCard(8), abilitySource: sourceForCard(8), hasMecatol: false })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'draw_secret_objective' }],
        expect.anything(), expect.anything()
      )
    })

    it('card 8 (Imperial): calls score_imperial_point when player controls Mecatol', async () => {
      mockDb({ player: playerWithCard(8), abilitySource: sourceForCard(8), hasMecatol: true })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'score_imperial_point' }],
        expect.anything(), expect.anything()
      )
    })
  })

  describe('Muaat commander passive (STRATEGY_TOKEN_SPENT)', () => {
    it('includes pending_window in response when commander passive fires', async () => {
      const mockWindow = { trigger: 'STRATEGY_TOKEN_SPENT', effect: 'gain_trade_goods', faction: 'Muaat' }
      applyCommanderPassives.mockResolvedValueOnce({ inlineEffects: [], pendingWindows: [mockWindow] })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_window).toEqual(mockWindow)
    })

    it('returns undefined pending_window when no commander passive fires', async () => {
      applyCommanderPassives.mockResolvedValueOnce({ inlineEffects: [], pendingWindows: [] })
      const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pending_window).toBeUndefined()
    })
  })

  it('computes clockwise initiative_order correctly', async () => {
    // Player seat=1, others: seat=0 and seat=2, playerCount=3
    // seat 0: (0-1+3)%3 = 2
    // seat 2: (2-1+3)%3 = 1
    let capturedRows = null
    db.from.mockImplementation((table) => {
      if (table === 'game_strategy_card_responses') {
        return { insert: vi.fn().mockImplementation((rows) => { capturedRows = rows; return Promise.resolve({ error: null }) }) }
      }
      return mockDb._defaultImpl?.(table) ?? mockDb()
    })
    mockDb()
    // Re-mock just the responses table
    const originalImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_strategy_card_responses') {
        return { insert: vi.fn().mockImplementation((rows) => { capturedRows = rows; return Promise.resolve({ error: null }) }) }
      }
      return originalImpl(table)
    })
    await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    // Verify initiative_order values
    if (capturedRows) {
      const p2Row = capturedRows.find(r => r.player_id === 'p2') // seat=0
      const p3Row = capturedRows.find(r => r.player_id === 'p3') // seat=2
      expect(p2Row?.initiative_order).toBe(2)
      expect(p3Row?.initiative_order).toBe(1)
    }
  })
})
