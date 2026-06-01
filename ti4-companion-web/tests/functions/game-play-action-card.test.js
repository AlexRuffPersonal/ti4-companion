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

import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('game-play-action-card', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const CARD_ID = 'card-uuid'
const OTHER_PLAYER_ID = 'other-player-uuid'

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

describe('phase 30 — tech effects', () => {
  const GAME_ID_P30 = 'game-1'
  const CARD_ID_P30 = 'card-1'
  const CALLER_PLAYER_ID = 'player-caller'
  const YSSARIL_PLAYER_ID = 'player-yssaril'
  const XXCHA_PLAYER_ID = 'player-xxcha'

  // Base game: action phase, Yssaril is active
  const baseGame = {
    id: GAME_ID_P30,
    phase: 'action',
    active_player_id: YSSARIL_PLAYER_ID,
    pending_action_window: null,
  }

  // Action card with Action: timing
  const actionCard = {
    id: CARD_ID_P30,
    state: 'held',
    held_by_player_id: CALLER_PLAYER_ID,
    timing: 'Action:',
    ability: [{ op: 'gain_trade_goods', amount: 1 }],
  }

  function setupMocks({ callerPlayer, allPlayers, card = actionCard, game = baseGame }) {
    const gamesUpdateCalls = []
    const gamePlayersUpdateCalls = []
    const cardUpdateCalls = []

    requireAuth.mockResolvedValue('user-caller')

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            if (fields.includes('exhausted_technologies')) {
              // allPlayers query
              return {
                eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
              }
            }
            if (fields === 'id') {
              // nextPlayer initiative_order query
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }
            }
            // caller query
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((vals) => {
            gamePlayersUpdateCalls.push(vals)
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
          }),
        }
      }
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: card, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            cardUpdateCalls.push(vals)
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
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
          update: vi.fn().mockImplementation((vals) => {
            gamesUpdateCalls.push(vals)
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
          }),
        }
      }
      return {}
    })

    return { gamesUpdateCalls, gamePlayersUpdateCalls, cardUpdateCalls }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Transparasteel Plating (Yssaril technology)', () => {
    it('blocks a passed player from playing action cards during Yssaril turn', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: true,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 1 },
        },
      ]

      setupMocks({ callerPlayer, allPlayers, game: { ...baseGame, active_player_id: YSSARIL_PLAYER_ID } })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error).toMatch(/cannot play action cards during yssaril turn after passing/i)
    })

    it('allows a non-passed player to play action cards during Yssaril turn', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]

      // Caller IS the active player for this test, not Yssaril
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }
      setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))

      expect(res.status).toBe(200)
    })

    it('does not block when Yssaril player is not the active player', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: true,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: YSSARIL_PLAYER_ID,
          technologies: ['Transparasteel Plating'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]

      // Caller is the active player, not Yssaril
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }
      setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))

      expect(res.status).toBe(200)
    })
  })

  describe('Instinct Training (Xxcha technology)', () => {
    it('opens a when_action_card_played window after Action: card is played when Xxcha has unexhausted Instinct Training and a strategy token', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const xxchaPlayer = {
        id: XXCHA_PLAYER_ID,
        technologies: ['Instinct Training'],
        exhausted_technologies: [],
        command_tokens: { strategy: 1 },
      }
      const allPlayers = [callerPlayer, xxchaPlayer]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.instinct_training_window).toBe(true)
      expect(json.discarded).toBe(CARD_ID_P30)

      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeTruthy()
      expect(windowUpdate.pending_action_window.type).toBe('when_action_card_played')
      expect(windowUpdate.pending_action_window.eligible_player_ids).toContain(XXCHA_PLAYER_ID)
      expect(windowUpdate.pending_action_window.passed_player_ids).toEqual([])
      expect(windowUpdate.pending_action_window.context.card_id).toBe(CARD_ID_P30)
      expect(windowUpdate.pending_action_window.context.playing_player_id).toBe(CALLER_PLAYER_ID)
    })

    it('does not open a window when no player has Instinct Training', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Neural Motivator'],
          exhausted_technologies: [],
          command_tokens: { strategy: 1 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.instinct_training_window).toBeUndefined()
      // No games update for pending_action_window
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })

    it('does not open a window when Instinct Training is exhausted', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Instinct Training'],
          exhausted_technologies: ['Instinct Training'],
          command_tokens: { strategy: 1 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))

      expect(res.status).toBe(200)
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })

    it('does not open a window when Xxcha has no strategy tokens', async () => {
      const callerPlayer = {
        id: CALLER_PLAYER_ID,
        action_card_count: 3,
        passed: false,
        technologies: [],
      }
      const allPlayers = [
        callerPlayer,
        {
          id: XXCHA_PLAYER_ID,
          technologies: ['Instinct Training'],
          exhausted_technologies: [],
          command_tokens: { strategy: 0 },
        },
      ]
      const game = { ...baseGame, active_player_id: CALLER_PLAYER_ID }

      const { gamesUpdateCalls } = setupMocks({ callerPlayer, allPlayers, game })

      const res = await handler(makeRequest({ game_id: GAME_ID_P30, card_id: CARD_ID_P30 }))

      expect(res.status).toBe(200)
      const windowUpdate = gamesUpdateCalls.find(c => c.pending_action_window)
      expect(windowUpdate).toBeUndefined()
    })
  })
})
