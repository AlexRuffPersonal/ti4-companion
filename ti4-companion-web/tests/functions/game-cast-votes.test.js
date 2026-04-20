// tests/functions/game-cast-votes.test.js
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
vi.mock('../../../supabase/functions/_shared/player-order.ts', () => ({
  getNextPlayer: vi.fn().mockResolvedValue('p3'),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-cast-votes/index.ts'

const GAME_ID = 'game-uuid'
const VOTER_USER_ID = 'voter-user-uuid'
const VOTER_PLAYER_ID = 'p2'
const AGENDA_ID = 'agenda-uuid'
const SPEAKER_PLAYER_ID = 'p1'

function makeRequest(body) {
  return new Request('http://localhost/game-cast-votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let upsertVotesMock, updateGameMock

function mockDb({
  game = {
    id: GAME_ID,
    speaker_player_id: SPEAKER_PLAYER_ID,
    agenda_current_card_id: AGENDA_ID,
    agenda_vote_current_player_id: VOTER_PLAYER_ID,
  },
  callerPlayer = { id: VOTER_PLAYER_ID },
  planets = [
    { exhausted: false, influence: 3 },
    { exhausted: false, influence: 2 },
    { exhausted: true,  influence: 1 },
  ],
  existingVotes = [],
  upsertError = null,
  updateGameError = null,
} = {}) {
  upsertVotesMock = vi.fn().mockResolvedValue({ error: upsertError })
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: updateGameMock,
    }
    if (table === 'game_players') {
      const allPlayersData = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
      // The .eq('game_id', ...) result must be both:
      //   - awaitable (for the total-players query: await db.from(...).select().eq('game_id', ...))
      //   - chainable with .eq('user_id', ...) (for the caller lookup)
      const gameIdEqResult = {
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: allPlayersData, error: null }).then(onFulfilled, onRejected),
        catch: (onRejected) =>
          Promise.resolve({ data: allPlayersData, error: null }).catch(onRejected),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
        }),
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(gameIdEqResult),
        }),
      }
    }
    if (table === 'game_player_planets') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: planets, error: null }),
        }),
      }),
    }
    if (table === 'game_agenda_votes') return {
      upsert: upsertVotesMock,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existingVotes, error: null }),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(VOTER_USER_ID)
})

describe('game-cast-votes', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when it is not the caller's turn", async () => {
    mockDb({ callerPlayer: { id: 'p3' } }) // not the current voter
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when no agenda is in play', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: null, agenda_vote_current_player_id: VOTER_PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when vote_count exceeds available influence', async () => {
    // max non-exhausted influence = 3 + 2 = 5
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 6 }))
    expect(res.status).toBe(400)
  })

  it('upserts vote and advances current voter on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ game_player_id: VOTER_PLAYER_ID, choice: 'For', vote_count: 2, abstained: false }),
      expect.anything(),
    )
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: 'p3' }),
    )
  })

  it('accepts abstain and sets vote_count 0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, abstain: true }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ abstained: true, vote_count: 0 }),
      expect.anything(),
    )
  })

  it('sets agenda_vote_current_player_id to null when all players have voted', async () => {
    mockDb({
      existingVotes: [
        { game_player_id: 'p1' },
        { game_player_id: 'p2' },
        { game_player_id: 'p3' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: null }),
    )
  })
})
