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
import { handler } from '../../../supabase/functions/game-remove-bot/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-remove-bot', body)

const BOT_PLAYER_ID = 'bot-player-uuid'

const VALID_BODY = { game_id: GAME_ID, bot_player_id: BOT_PLAYER_ID }

function mockDbDetailed({
  player = { id: PLAYER_ID },
  game = { status: 'lobby', host_user_id: USER_ID },
  botRow = { id: BOT_PLAYER_ID, is_bot: true, faction: 'Arborec' },
} = {}) {
  let gamePlayersCallCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const callNum = gamePlayersCallCount
      if (callNum === 1) {
        // player lookup: .select('id').eq(game_id).eq(user_id).maybeSingle()
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
      if (callNum === 2) {
        // bot row lookup: .select(...).eq(id).eq(game_id).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: botRow, error: null }),
              }),
            }),
          }),
        }
      }
      // delete
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
    return nullSafeChain()
  })
}

describe('game-remove-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for OPTIONS (CORS preflight)', async () => {
    const req = new Request('http://localhost/game-remove-bot', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ bot_player_id: BOT_PLAYER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when bot_player_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
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
    mockDbDetailed({ game: { status: 'in_progress', host_user_id: USER_ID } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already started/i)
  })

  it('returns 403 when caller is not host', async () => {
    mockDbDetailed({ game: { status: 'lobby', host_user_id: 'other-user-id' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('returns 404 when bot not found', async () => {
    mockDbDetailed({ botRow: null })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Bot not found/i)
  })

  it('returns 409 when target player is not a bot', async () => {
    mockDbDetailed({ botRow: { id: BOT_PLAYER_ID, is_bot: false, faction: 'Arborec' } })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Not a bot/i)
  })

  it('deletes bot row, calls logEvent, returns 200 with removed id', async () => {
    let deleteCalled = false
    let deleteEqArg = null
    let gamePlayersCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        const callNum = gamePlayersCallCount
        if (callNum === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
                }),
              }),
            }),
          }
        }
        if (callNum === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: BOT_PLAYER_ID, is_bot: true, faction: 'Arborec' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        // delete call
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((field) => {
              deleteCalled = true
              deleteEqArg = field
              return { error: null }
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'lobby', host_user_id: USER_ID },
                error: null,
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
      return nullSafeChain()
    })

    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(deleteCalled).toBe(true)
    expect(logEvent).toHaveBeenCalledOnce()
    const body = await res.json()
    expect(body.removed).toBe(BOT_PLAYER_ID)
  })
})
