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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-discard-secret-objective/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OBJ_ID = 'obj-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-discard-secret-objective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, secrets_selected: false },
  playerError = null,
  row = { id: OBJ_ID, state: 'held', player_id: PLAYER_ID },
  rowError = null,
  deckSize = 3,
  deckCountError = null,
  updateObjError = null,
  updatePlayerError = null,
} = {}) {
  const updateObjMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateObjError }),
  })
  const updatePlayerMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updatePlayerError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
        update: updatePlayerMock,
      }
    }
    if (table === 'game_player_secret_objectives') {
      return {
        select: vi.fn((fields, opts) => {
          if (opts && opts.count === 'exact') {
            // deck count query
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: deckSize, error: deckCountError }),
              }),
            }
          }
          // row fetch query
          return {
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: row, error: rowError }),
            }),
          }
        }),
        update: updateObjMock,
      }
    }
  })
  return { updateObjMock, updatePlayerMock }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-discard-secret-objective', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when objective_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when caller is not in the game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when objective row does not exist', async () => {
    mockDb({ row: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when objective is not held', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'deck', player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not held/i)
  })

  it('returns 403 when caller does not hold the objective', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 and discards on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(true)
  })

  it('sets objective state to deck and clears player_id', async () => {
    const { updateObjMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updateObjMock).toHaveBeenCalledOnce()
    const updateArg = updateObjMock.mock.calls[0][0]
    expect(updateArg.state).toBe('deck')
    expect(updateArg.player_id).toBeNull()
    expect(typeof updateArg.deck_position).toBe('number')
  })

  it('deck_position is within [0, deck_size]', async () => {
    const { updateObjMock } = mockDb({ deckSize: 5 })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    const pos = updateObjMock.mock.calls[0][0].deck_position
    expect(pos).toBeGreaterThanOrEqual(0)
    expect(pos).toBeLessThanOrEqual(5)
  })

  it('sets secrets_selected = true when it was false', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, secrets_selected: false } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).toHaveBeenCalledOnce()
    expect(updatePlayerMock.mock.calls[0][0]).toMatchObject({ secrets_selected: true })
  })

  it('does not update secrets_selected when it was already true', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, secrets_selected: true } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).not.toHaveBeenCalled()
  })

  it('is callable during standard game (no phase guard)', async () => {
    // No phase check — just verifies the function does not reject with a phase error
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
  })
})