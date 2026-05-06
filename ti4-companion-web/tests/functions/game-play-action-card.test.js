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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
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

  // Track how many times game_players.select has been called to distinguish query patterns:
  // Call 0: player fetch (select + 2x eq + maybeSingle)
  // Call 1: allPlayers fetch (select + 1x eq, returns array)
  // Call 2: nextPlayer fetch (select + 2x eq + order + limit + maybeSingle)
  let gamePlayersSelectCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation(() => {
          const callIndex = gamePlayersSelectCount++
          if (callIndex === 0) {
            // Initial player fetch
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: config.player, error: null }),
                }),
              }),
            }
          } else if (callIndex === 1) {
            // allPlayers fetch — returns array (no maybeSingle)
            const allPlayersData = config.player
              ? [{ id: config.player.id, technologies: [], exhausted_technologies: [], command_tokens: { strategy: 0 } }]
              : []
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayersData, error: null }),
            }
          } else {
            // nextPlayer fetch (initiative_order query)
            const nextPlayerData = config.nextPlayer !== undefined ? config.nextPlayer : null
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: nextPlayerData, error: null }),
                    }),
                  }),
                }),
              }),
            }
          }
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

describe('Action: card resolveAbility and turn advancement', () => {
  const NEXT_PLAYER_ID = 'next-player-uuid'

  it('409 if Action: card ability is null', async () => {
    mockDb({
      card: {
        id: CARD_ID,
        state: 'held',
        held_by_player_id: PLAYER_ID,
        timing: 'Action:',
        ability: null,
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not implemented/i)
  })

  it('resolveAbility called and turn advances when Action: card is valid', async () => {
    mockDb({
      card: {
        id: CARD_ID,
        state: 'held',
        held_by_player_id: PLAYER_ID,
        timing: 'Action:',
        ability: [{ op: 'gain_trade_goods', amount: 1 }],
      },
      nextPlayer: { id: NEXT_PLAYER_ID },
    })

    const gamesUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const gamePlayersUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    // Wrap the mockDb to capture update calls
    const originalFrom = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const result = originalFrom(table)
      if (table === 'games') result.update = gamesUpdateMock
      if (table === 'game_players') result.update = gamePlayersUpdateMock
      return result
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalled()
    expect(gamePlayersUpdateMock).toHaveBeenCalledWith({ passed: true })
    expect(gamesUpdateMock).toHaveBeenCalledWith({ active_player_id: NEXT_PLAYER_ID })
  })

  it('sets active_player_id to null when all players have passed', async () => {
    mockDb({
      card: {
        id: CARD_ID,
        state: 'held',
        held_by_player_id: PLAYER_ID,
        timing: 'Action:',
        ability: [{ op: 'gain_trade_goods', amount: 1 }],
      },
      nextPlayer: null, // no non-passed players remain
    })

    const gamesUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    const originalFrom = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      const result = originalFrom(table)
      if (table === 'games') result.update = gamesUpdateMock
      return result
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: CARD_ID }))
    expect(res.status).toBe(200)
    expect(gamesUpdateMock).toHaveBeenCalledWith({ active_player_id: null })
  })
})
