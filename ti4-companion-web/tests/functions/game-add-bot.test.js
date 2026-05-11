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
  getUndoableEvents: vi.fn(),
  applyUndo: vi.fn().mockResolvedValue(undefined),
  EVT_ADD_BOT: 'add_bot',
  EVT_REMOVE_BOT: 'remove_bot',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-add-bot/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const NEW_BOT_ID = 'new-bot-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-add-bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  game_id: GAME_ID,
  display_name: 'Bot Alpha',
  faction: 'Arborec',
  color: 'green',
  bot_strategy: 'random',
}

function mockDb({
  player = { id: PLAYER_ID },
  game = { phase: 'lobby', host_player_id: PLAYER_ID, status: 'lobby' },
  factionConflict = null,
  colorConflict = null,
  playerCount = 2,
  newBot = { id: NEW_BOT_ID },
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      const selectMock = vi.fn()
      selectMock.mockImplementation((fields, opts) => {
        // Count query (head: true)
        if (opts && opts.head) {
          return {
            eq: vi.fn().mockResolvedValue({ count: playerCount, error: null }),
          }
        }
        // Insert returning single
        const insertMock = {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: newBot, error: null }),
            }),
          }),
        }
        // select('id').eq('game_id').eq('user_id').maybeSingle() — player lookup
        // select('id').eq('game_id').eq('faction').maybeSingle() — faction conflict
        // select('id').eq('game_id').eq('color').maybeSingle() — color conflict
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }
      })
      return {
        select: selectMock,
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newBot, error: null }),
          }),
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
    return {}
  })
}

// Finer-grained mock that routes table+field queries properly
function mockDbDetailed({
  player = { id: PLAYER_ID },
  game = { phase: 'lobby', host_player_id: PLAYER_ID, status: 'lobby' },
  factionConflict = null,
  colorConflict = null,
  playerCount = 2,
  newBot = { id: NEW_BOT_ID },
} = {}) {
  // Track call order to disambiguate the three game_players select queries
  let gamePlayersCallCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const callNum = gamePlayersCallCount
      return {
        select: vi.fn().mockImplementation((fields, opts) => {
          if (opts && opts.head) {
            // COUNT query
            return {
              eq: vi.fn().mockResolvedValue({ count: playerCount, error: null }),
            }
          }
          // call 1: player lookup (.eq(game_id).eq(user_id).maybeSingle)
          // call 2: faction conflict (.eq(game_id).eq(faction).maybeSingle)
          // call 3: color conflict (.eq(game_id).eq(color).maybeSingle)
          const result = callNum === 1 ? player : callNum === 2 ? factionConflict : colorConflict
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
            }),
          }
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newBot, error: null }),
          }),
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
    return {}
  })
}

describe('game-add-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for OPTIONS (CORS preflight)', async () => {
    const req = new Request('http://localhost/game-add-bot', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const { game_id, ...body } = VALID_BODY
    const res = await handler(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 400 when display_name is missing', async () => {
    const { display_name, ...body } = VALID_BODY
    const res = await handler(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 400 when faction is missing', async () => {
    const { faction, ...body } = VALID_BODY
    const res = await handler(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 400 when color is missing', async () => {
    const { color, ...body } = VALID_BODY
    const res = await handler(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 400 when bot_strategy is missing', async () => {
    const { bot_strategy, ...body } = VALID_BODY
    const res = await handler(makeRequest(body))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDbDetailed({ player: null })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 404 when game not found', async () => {
    mockDbDetailed({ game: null })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 409 when game is already started', async () => {
    mockDbDetailed({ game: { status: 'in_progress', host_player_id: PLAYER_ID, phase: 'action' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already started/i)
  })

  it('returns 403 when caller is not host', async () => {
    mockDbDetailed({ game: { status: 'lobby', host_player_id: 'other-player-id', phase: 'lobby' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('returns 400 when bot_strategy is invalid', async () => {
    mockDbDetailed()
    const res = await handler(makeRequest({ ...VALID_BODY, bot_strategy: 'cheating' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid bot_strategy/i)
  })

  it('returns 409 when faction is already taken', async () => {
    mockDbDetailed({ factionConflict: { id: 'existing-player' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Faction taken/i)
  })

  it('returns 409 when color is already taken', async () => {
    mockDbDetailed({ colorConflict: { id: 'existing-player' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Color taken/i)
  })

  it('inserts bot with is_bot=true and user_id=null, calls logEvent, returns 200', async () => {
    let insertArgs = null
    let gamePlayersCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        const callNum = gamePlayersCallCount
        return {
          select: vi.fn().mockImplementation((fields, opts) => {
            if (opts && opts.head) {
              return { eq: vi.fn().mockResolvedValue({ count: 2, error: null }) }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: callNum === 1 ? { id: PLAYER_ID } : null,
                    error: null,
                  }),
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }
          }),
          insert: vi.fn().mockImplementation((row) => {
            insertArgs = row
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: NEW_BOT_ID }, error: null }),
              }),
            }
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'lobby', host_player_id: PLAYER_ID, phase: 'lobby' },
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(insertArgs).toMatchObject({ is_bot: true, user_id: null, faction: 'Arborec', color: 'green' })
    expect(logEvent).toHaveBeenCalledOnce()
    const body = await res.json()
    expect(body.id).toBe(NEW_BOT_ID)
    expect(body.is_bot).toBe(true)
  })
})
