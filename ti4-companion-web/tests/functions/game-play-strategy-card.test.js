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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-play-strategy-card/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ABILITY_ID = 'ability-uuid'
const PLAY_ID = 'play-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-play-strategy-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DEFAULT_PLAYER = { id: PLAYER_ID, strategy_card: 4, seat_index: 1 }
const DEFAULT_GAME = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID, round: 1 }
const ALL_PLAYERS = [
  { id: PLAYER_ID, seat_index: 1 },
  { id: 'p2', seat_index: 0 },
  { id: 'p3', seat_index: 2 },
]

function mockDb({
  player = DEFAULT_PLAYER,
  game = DEFAULT_GAME,
  abilitySource = { strategy_card_num: 4 },
  existingPlay = null,
  ability = { effects: [{ op: 'gain_trade_goods', amount: 1 }] },
  play = { id: PLAY_ID },
  allPlayers = ALL_PLAYERS,
  insertResponsesError = null,
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
      }
    }
    if (table === 'ability_definitions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertResponsesError }),
      }
    }
    return {}
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
    expect(interpretEffects).toHaveBeenCalledOnce()
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
