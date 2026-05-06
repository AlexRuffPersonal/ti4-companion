import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: {
    from: vi.fn(),
    raw: (sql) => ({ _raw: sql }),
  },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-play-action-card/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const CARD_ID = 'card-uuid'
const OTHER_PLAYER_ID = 'other-player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-play-action-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDbDefaults() {
  return {
    player: { id: PLAYER_ID, action_card_count: 3 },
    card: {
      id: CARD_ID,
      state: 'held',
      held_by_player_id: PLAYER_ID,
      timing: 'Action:',
      ability: 'some_ability',
    },
    game: {
      id: GAME_ID,
      phase: 'action',
      active_player_id: PLAYER_ID,
      pending_action_window: null,
    },
  }
}

function mockDb(overrides = {}) {
  const defaults = mockDbDefaults()
  const config = { ...defaults, ...overrides }

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: config.player, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.card, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-play-action-card', () => {
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

  it('returns 404 when player not found', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when card not found', async () => {
    mockDb({ card: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when card is not held by caller', async () => {
    mockDb({ card: { id: CARD_ID, state: 'held', held_by_player_id: OTHER_PLAYER_ID, timing: 'Action:', ability: 'something' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 404 when game not found', async () => {
    mockDb({ game: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 200 for Action: card on active player turn', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(CARD_ID)
  })
})

describe('reactive timing branch', () => {
  const WINDOW = {
    type: 'when_agenda_revealed',
    eligible_player_ids: [PLAYER_ID, OTHER_PLAYER_ID],
    passed_player_ids: [],
  }

  const REACTIVE_CARD = {
    id: CARD_ID,
    state: 'held',
    held_by_player_id: PLAYER_ID,
    timing: 'When an agenda is revealed:',
    ability: 'agenda_reaction_ability',
  }

  it('409 if non-Action: card played with no open window', async () => {
    mockDb({
      card: REACTIVE_CARD,
      game: { id: GAME_ID, phase: 'agenda', active_player_id: PLAYER_ID, pending_action_window: null },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/No active window/)
  })

  it('409 if card timing does not match open window type', async () => {
    mockDb({
      card: REACTIVE_CARD,
      game: {
        id: GAME_ID,
        phase: 'agenda',
        active_player_id: PLAYER_ID,
        pending_action_window: {
          type: 'when_voting_begins',
          eligible_player_ids: [PLAYER_ID],
          passed_player_ids: [],
        },
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Card timing does not match/)
  })

  it('409 if player not in eligible_player_ids', async () => {
    mockDb({
      card: REACTIVE_CARD,
      game: {
        id: GAME_ID,
        phase: 'agenda',
        active_player_id: PLAYER_ID,
        pending_action_window: {
          type: 'when_agenda_revealed',
          eligible_player_ids: [OTHER_PLAYER_ID],
          passed_player_ids: [],
        },
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Not eligible/)
  })

  it('409 if non-Action: card has null ability', async () => {
    mockDb({
      card: { ...REACTIVE_CARD, ability: null },
      game: {
        id: GAME_ID,
        phase: 'agenda',
        active_player_id: PLAYER_ID,
        pending_action_window: WINDOW,
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not implemented/)
  })

  it('discards card and clears window when all eligible have acted', async () => {
    // Both players eligible, only OTHER_PLAYER has already passed — PLAYER acts now, completing all
    mockDb({
      card: REACTIVE_CARD,
      game: {
        id: GAME_ID,
        phase: 'agenda',
        active_player_id: PLAYER_ID,
        pending_action_window: {
          type: 'when_agenda_revealed',
          eligible_player_ids: [PLAYER_ID, OTHER_PLAYER_ID],
          passed_player_ids: [OTHER_PLAYER_ID],
        },
      },
    })

    const gamesUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 2 }, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: REACTIVE_CARD, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: GAME_ID,
                  phase: 'agenda',
                  active_player_id: PLAYER_ID,
                  pending_action_window: {
                    type: 'when_agenda_revealed',
                    eligible_player_ids: [PLAYER_ID, OTHER_PLAYER_ID],
                    passed_player_ids: [OTHER_PLAYER_ID],
                  },
                },
                error: null,
              }),
            }),
          }),
          update: gamesUpdateMock,
        }
      }
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(CARD_ID)

    // Should have cleared the window (set to null)
    expect(gamesUpdateMock).toHaveBeenCalledWith({ pending_action_window: null })
  })

  it('discards card and updates passed_player_ids when others still eligible', async () => {
    // Only PLAYER acts; OTHER_PLAYER hasn't yet — window should be updated, not cleared
    mockDb({
      card: REACTIVE_CARD,
      game: {
        id: GAME_ID,
        phase: 'agenda',
        active_player_id: PLAYER_ID,
        pending_action_window: WINDOW,
      },
    })

    const gamesUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 2 }, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: REACTIVE_CARD, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: GAME_ID,
                  phase: 'agenda',
                  active_player_id: PLAYER_ID,
                  pending_action_window: WINDOW,
                },
                error: null,
              }),
            }),
          }),
          update: gamesUpdateMock,
        }
      }
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(CARD_ID)

    // Should have updated passed_player_ids (not cleared the window)
    expect(gamesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_action_window: expect.objectContaining({
          passed_player_ids: expect.arrayContaining([PLAYER_ID]),
        }),
      })
    )
    // Verify window was NOT nulled out
    const callArg = gamesUpdateMock.mock.calls[0][0]
    expect(callArg.pending_action_window).not.toBeNull()
  })
})
