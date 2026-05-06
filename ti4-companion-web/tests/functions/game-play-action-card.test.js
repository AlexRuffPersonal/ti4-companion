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
  dslError: vi.fn((msg, status = 409) => { const e = new Error(msg); e.status = status; return e }),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-play-action-card/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const CARD_ID = 'deck-card-uuid'
const ACTION_CARD_ABILITY = [{ op: 'gain_trade_goods', amount: 1 }]

function makeRequest(body) {
  return new Request('http://localhost/game-play-action-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let discardUpdateMock, gameUpdateMock, playerUpdateMock

function mockDb({
  player = { id: PLAYER_ID, action_card_count: 3 },
  game = { phase: 'action', active_player_id: PLAYER_ID, round: 1 },
  deckRow = {
    id: CARD_ID,
    action_card_id: 'ac-uuid',
    state: 'hand',
    held_by_player_id: PLAYER_ID,
    action_cards: { id: 'ac-uuid', name: 'Test Card', timing: 'Action:', ability: ACTION_CARD_ABILITY },
  },
  nextPlayers = [],
} = {}) {
  discardUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  gameUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col) => {
            if (col === 'user_id') {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }
            }
            // passed=false → next players query
            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: nextPlayers, error: null }),
              }),
            }
          }),
        }),
      }),
      update: playerUpdateMock,
    }
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: gameUpdateMock,
    }
    if (table === 'game_action_card_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: deckRow, error: null }),
            }),
          }),
        }),
      }),
      update: discardUpdateMock,
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-play-action-card (Phase 29a)', () => {
  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ card_id: CARD_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when card_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 if game phase is not action', async () => {
    mockDb({ game: { phase: 'status', active_player_id: PLAYER_ID, round: 1 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the action phase/i)
  })

  it('returns 409 if not active player', async () => {
    mockDb({ game: { phase: 'action', active_player_id: 'other-player', round: 1 } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not your turn/i)
  })

  it('returns 404 if card not in player hand', async () => {
    mockDb({ deckRow: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 if card timing is not Action:', async () => {
    mockDb({ deckRow: { id: CARD_ID, action_card_id: 'ac-uuid', state: 'hand', held_by_player_id: PLAYER_ID, action_cards: { id: 'ac-uuid', name: 'Bad Timing', timing: 'Combat Round:', ability: ACTION_CARD_ABILITY } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/timing is not action/i)
  })

  it('returns 409 if card ability is null', async () => {
    mockDb({ deckRow: { id: CARD_ID, action_card_id: 'ac-uuid', state: 'hand', held_by_player_id: PLAYER_ID, action_cards: { id: 'ac-uuid', name: 'Unimplemented', timing: 'Action:', ability: null } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not implemented/i)
  })

  it('GIVEN valid Action: card — calls interpretEffects, discards card, advances turn', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(
      ACTION_CARD_ABILITY,
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID }),
      expect.anything()
    )
    expect(discardUpdateMock).toHaveBeenCalledWith({ state: 'discard', held_by_player_id: null })
    expect(playerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ action_card_count: 2 }))
    const body = await res.json()
    expect(body.discarded).toBe(CARD_ID)
  })

  it('GIVEN all other players have passed — sets active_player_id to null', async () => {
    mockDb({ nextPlayers: [] })
    await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(gameUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ active_player_id: null }))
  })
})
