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
import { handler } from '../../../supabase/functions/game-use-strategy-secondary/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const PLAY_ID = 'play-uuid'
const ABILITY_ID = 'ability-uuid'
const RESPONSE_ID = 'response-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-use-strategy-secondary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID },
  play = { id: PLAY_ID, played_by_player_id: 'other-player', card_number: 4 },
  nextResponse = { id: RESPONSE_ID, player_id: PLAYER_ID },
  abilitySource = { strategy_card_num: 4 },
  ability = { effects: [{ op: 'gain_trade_goods', amount: 1 }] },
  updateResponseError = null,
  pendingCount = 0,
  completeError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
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
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: play, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: completeError }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: nextResponse, error: null }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateResponseError }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses_count') {
      // handled via select with count
      return {}
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
    if (table === 'ability_definitions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }),
          }),
        }),
      }
    }
    return {}
  })

  // Override pending count query
  const originalImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_strategy_card_responses') {
      let callCount = 0
      return {
        select: vi.fn().mockImplementation((cols, opts) => {
          callCount++
          if (opts?.count === 'exact') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: pendingCount, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: nextResponse, error: null }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateResponseError }),
        }),
      }
    }
    return originalImpl(table)
  })
}

describe('game-use-strategy-secondary', () => {
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
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when play_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when no active play', async () => {
    mockDb({ play: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when caller is the play owner', async () => {
    mockDb({ play: { id: PLAY_ID, played_by_player_id: PLAYER_ID, card_number: 4 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when not the next pending responder', async () => {
    mockDb({ nextResponse: { id: RESPONSE_ID, player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with responded=true and play_complete=false when others still pending', async () => {
    mockDb({ pendingCount: 1 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.responded).toBe(true)
    expect(body.play_complete).toBe(false)
    expect(interpretEffects).toHaveBeenCalledOnce()
  })

  it('returns 200 with play_complete=true when this was the last pending response', async () => {
    mockDb({ pendingCount: 0 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.play_complete).toBe(true)
  })
})
