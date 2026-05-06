// tests/functions/game-draw-agenda.test.js
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
  getNextPlayer: vi.fn().mockResolvedValue('p2'),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getNextPlayer } from '../../../supabase/functions/_shared/player-order.ts'
import { handler } from '../../../supabase/functions/game-draw-agenda/index.ts'

const GAME_ID = 'game-uuid'
const SPEAKER_USER_ID = 'speaker-user-uuid'
const SPEAKER_PLAYER_ID = 'speaker-player-uuid'
const CARD_ID = 'agenda-card-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-draw-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateGameMock, updateDeckMock

function mockDb({
  game = {
    id: GAME_ID,
    speaker_player_id: SPEAKER_PLAYER_ID,
    agenda_phase_step: 'agenda_1_voting',
    agenda_current_card_id: null,
    current_vote_sequence: 0,
  },
  callerPlayer = { id: SPEAKER_PLAYER_ID },
  topCard = { id: CARD_ID, agenda_id: 'ag-uuid', deck_position: 0 },
  updateGameError = null,
  updateDeckError = null,
  eligibleCardRows = [],
} = {}) {
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })
  updateDeckMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateDeckError }),
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
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
          }),
        }),
      }),
    }
    if (table === 'game_agenda_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [topCard], error: null }),
            }),
          }),
        }),
      }),
      update: updateDeckMock,
    }
    if (table === 'game_action_card_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: eligibleCardRows, error: null }),
            }),
          }),
        }),
      }),
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(SPEAKER_USER_ID)
})

describe('game-draw-agenda', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the speaker', async () => {
    mockDb({ callerPlayer: { id: 'not-speaker' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when a card is already in play', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_voting', agenda_current_card_id: 'existing-card', current_vote_sequence: 0 } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when step is inactive', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'inactive', agenda_current_card_id: null, current_vote_sequence: 0 } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('sets deck row to voting and updates game on success', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'voting' })
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_current_card_id: 'ag-uuid',
      current_vote_sequence: 1,
    }))
  })

  it('advances step from agenda_1_resolved to agenda_2_voting', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_resolved', agenda_current_card_id: null, current_vote_sequence: 1 } })
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_2_voting',
    }))
  })

  it('keeps step as agenda_1_voting when drawing first card', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_1_voting',
    }))
  })

  it('sets agenda_vote_current_player_id from getNextPlayer', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(getNextPlayer).toHaveBeenCalled()
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_vote_current_player_id: 'p2',
    }))
  })

  it('returns 200 on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })

  it('GIVEN no player holds a When-agenda-revealed card — does NOT set pending_action_window', async () => {
    mockDb({ eligibleCardRows: [] })
    await handler(makeRequest({ game_id: GAME_ID }))
    // updateGameMock should only have been called once (the main game update, not a second window update)
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeUndefined()
  })

  it('GIVEN player holds a When-agenda-revealed card — sets pending_action_window with eligible player', async () => {
    const HOLDER_ID = 'player-holding-card'
    mockDb({ eligibleCardRows: [{ held_by_player_id: HOLDER_ID }] })
    await handler(makeRequest({ game_id: GAME_ID }))
    const windowCall = updateGameMock.mock.calls.find(
      ([arg]) => arg && arg.pending_action_window !== undefined
    )
    expect(windowCall).toBeDefined()
    expect(windowCall[0].pending_action_window).toMatchObject({
      type: 'when_agenda_revealed',
      eligible_player_ids: [HOLDER_ID],
      passed_player_ids: [],
    })
  })
})
