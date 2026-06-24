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
vi.mock('../../../supabase/functions/_shared/undoHandlers.ts', () => ({
  applyUndoHandler: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getUndoableEvents, applyUndo } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyUndoHandler } from '../../../supabase/functions/_shared/undoHandlers.ts'
import { handler } from '../../../supabase/functions/game-undo/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-undo', body)

const EVENT_ID = 'event-uuid'

const SAMPLE_GAME = { id: GAME_ID, phase: 'action', round: 1 }
const SAMPLE_PLAYERS = [{ id: PLAYER_ID, faction: 'Arborec' }]
const SAMPLE_EVENT = { id: EVENT_ID, event_type: 'research_technology', payload: { tech: 'Sling Relay' } }

function mockDb({
  player = { id: PLAYER_ID },
  game = { host_user_id: USER_ID, round: 1, phase: 'action' },
  updatedGame = SAMPLE_GAME,
  updatedPlayers = SAMPLE_PLAYERS,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
            // for the final SELECT * FROM game_players WHERE game_id
            mockReturnValue: vi.fn().mockResolvedValue({ data: updatedPlayers, error: null }),
          }),
          // final query returning players array
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game ?? updatedGame, error: null }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

function mockDbFull({
  player = { id: PLAYER_ID },
  game = { host_user_id: USER_ID, round: 1, phase: 'action' },
  updatedGame = SAMPLE_GAME,
  updatedPlayers = SAMPLE_PLAYERS,
} = {}) {
  let gamesCallCount = 0
  let gamePlayersCallCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      const callNum = gamePlayersCallCount
      if (callNum === 1) {
        // player lookup
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
      // final SELECT * query — returns array
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: updatedPlayers, error: null }),
        }),
      }
    }
    if (table === 'games') {
      gamesCallCount++
      // Both game fetch and updated game fetch
      const data = gamesCallCount === 1 ? game : updatedGame
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

describe('game-undo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    getUndoableEvents.mockResolvedValue([SAMPLE_EVENT])
  })

  it('returns 204 for OPTIONS (CORS preflight)', async () => {
    const req = new Request('http://localhost/game-undo', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDbFull({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when game not found', async () => {
    mockDbFull({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not host', async () => {
    mockDbFull({ game: { host_user_id: 'other-user-id', round: 1, phase: 'action' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when there are no undoable events', async () => {
    getUndoableEvents.mockResolvedValue([])
    mockDbFull()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Nothing to undo/i)
  })

  it('calls applyUndoHandler and applyUndo, returns 200 with game/players/undone_event_type', async () => {
    mockDbFull()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(applyUndoHandler).toHaveBeenCalledWith(expect.anything(), SAMPLE_EVENT)
    expect(applyUndo).toHaveBeenCalledWith(expect.anything(), EVENT_ID)
    const body = await res.json()
    expect(body.undone_event_type).toBe('research_technology')
    expect(body).toHaveProperty('game')
    expect(body).toHaveProperty('players')
  })
})
