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
  EVT_SCORE_SECRET: 'score_secret_objective',
}))
vi.mock('../../../supabase/functions/_shared/objectiveConditions.ts', () => ({
  buildEvaluationContext: vi.fn().mockResolvedValue({}),
  evaluateCondition: vi.fn().mockReturnValue({ eligible: true, reason: '' }),
  applySpendSideEffect: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../../../supabase/functions/_shared/objectiveConditions.ts'
import { handler } from '../../../supabase/functions/game-score-secret-objective/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const OBJ_ID = 'obj-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-score-secret-objective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, vp: 3, secret_objective_count: 0 },
  playerError = null,
  game = { id: GAME_ID, phase: 'status', round: 2 },
  gameError = null,
  row = { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } },
  rowError = null,
  alreadyScoredCount = 0,
  scoredCountError = null,
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
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
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
            // already-scored-this-round count
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: alreadyScoredCount, error: scoredCountError }),
                }),
              }),
            }
          }
          // objective row fetch
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
  evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
  buildEvaluationContext.mockResolvedValue({})
  applySpendSideEffect.mockResolvedValue(undefined)
})

describe('game-score-secret-objective', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when player is not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when objective row is not found', async () => {
    mockDb({ row: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when objective is not held', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'scored', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not held/i)
  })

  it('returns 403 when caller does not hold the objective', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: 'other-player', secret_objectives: { timing: 'status' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when game phase does not match objective timing', async () => {
    mockDb({
      game: { id: GAME_ID, phase: 'action', round: 2 },
      row: { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status' } },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/timing/i)
  })

  it('returns 409 when caller already scored a secret this round', async () => {
    mockDb({ alreadyScoredCount: 1 })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already scored/i)
  })

  it('returns 200 and scores on happy path', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scored).toBe(true)
  })

  it('sets objective state to scored with scored_at_round', async () => {
    const { updateObjMock } = mockDb()
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updateObjMock).toHaveBeenCalledOnce()
    expect(updateObjMock.mock.calls[0][0]).toMatchObject({ state: 'scored', scored_at_round: 2 })
  })

  it('increments player vp by 1 and secret_objective_count by 1', async () => {
    const { updatePlayerMock } = mockDb({ player: { id: PLAYER_ID, vp: 3, secret_objective_count: 1 } })
    await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(updatePlayerMock).toHaveBeenCalledOnce()
    expect(updatePlayerMock.mock.calls[0][0]).toMatchObject({ vp: 4, secret_objective_count: 2 })
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'score_secret_objective' }))
  })

  it('returns 422 when condition is not met', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status', condition_check: { type: 'count_planets', params: { min: 6 } } } } })
    evaluateCondition.mockReturnValue({ eligible: false, reason: 'Need more' })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/Need more/i)
  })

  it('returns 200 and scores when condition is met', async () => {
    mockDb({ row: { id: OBJ_ID, state: 'held', player_id: PLAYER_ID, secret_objectives: { timing: 'status', condition_check: { type: 'count_planets', params: { min: 3 } } } } })
    evaluateCondition.mockReturnValue({ eligible: true, reason: '' })
    const res = await handler(makeRequest({ game_id: GAME_ID, objective_id: OBJ_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scored).toBe(true)
  })
})