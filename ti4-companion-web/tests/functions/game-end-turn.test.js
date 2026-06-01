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
  EVT_END_TURN: 'end_turn',
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-end-turn/index.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-end-turn', body)

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const PLAY_ID = 'play-uuid'

const ALL_PLAYERS = [
  { id: PLAYER_ID, strategy_card: 4, passed: false },
  { id: 'p2', strategy_card: 7, passed: false },
]

const BASE_CALLER = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], second_action_available: false }

function mockDb({
  game = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID },
  callerPlayer = BASE_CALLER,
  activePay = null,
  players = ALL_PLAYERS,
  updateError = null,
} = {}) {
  const updateResponsesMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
  const updatePlaysMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          if (cols.includes('second_action_available')) {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: players, error: null }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: activePay, error: null }),
              }),
            }),
          }),
        }),
        update: updatePlaysMock,
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        update: updateResponsesMock,
      }
    }
    return nullSafeChain()
  })

  return { updateResponsesMock, updatePlaysMock }
}

describe('game-end-turn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeldNotes.mockResolvedValue([])
    returnNote.mockResolvedValue(undefined)
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
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

  it('returns 409 when not in action phase', async () => {
    mockDb({ game: { id: GAME_ID, phase: 'strategy', active_player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 403 when not the active player', async () => {
    mockDb({ game: { id: GAME_ID, phase: 'action', active_player_id: 'other' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 200 and advances to next player when no active strategy play', async () => {
    const { updateResponsesMock, updatePlaysMock } = mockDb({ activePay: null })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(updateResponsesMock).not.toHaveBeenCalled()
    expect(updatePlaysMock).not.toHaveBeenCalled()
  })

  it('auto-passes pending responses and completes play when ending turn with active strategy play', async () => {
    const { updateResponsesMock, updatePlaysMock } = mockDb({ activePay: { id: PLAY_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(updateResponsesMock).toHaveBeenCalled()
    expect(updatePlaysMock).toHaveBeenCalled()
  })

  describe('Fleet Logistics (Phase 30)', () => {
    it('first end-turn call sets second_action_available=true and returns without advancing', async () => {
      mockDb({ callerPlayer: { ...BASE_CALLER, technologies: ['Fleet Logistics'], second_action_available: false } })
      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.second_action_available).toBe(true)
      expect(body.advanced).toBeUndefined()
    })

    it('second end-turn call clears flag and advances normally', async () => {
      mockDb({ callerPlayer: { ...BASE_CALLER, technologies: ['Fleet Logistics'], second_action_available: true } })
      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.advanced).toBe(true)
    })
  })

  describe('Bio-Stims (Phase 30)', () => {
    it('readies target planet and exhausts Bio-Stims', async () => {
      let planetUpdated = false
      let bioStimsExhausted = false
      db.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        if (table === 'game_players') {
          return {
            select: vi.fn().mockImplementation((cols) => {
              if (cols.includes('second_action_available')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { ...BASE_CALLER, technologies: ['Bio-Stims'], exhausted_technologies: [] },
                        error: null,
                      }),
                    }),
                  }),
                }
              }
              return { eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS, error: null }) }) }
            }),
            update: vi.fn().mockImplementation((data) => {
              if (data.exhausted_technologies?.includes('Bio-Stims')) bioStimsExhausted = true
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'game_player_planets') {
          return {
            update: vi.fn().mockImplementation((data) => {
              if (data.exhausted === false) planetUpdated = true
              return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
            }),
          }
        }
        if (table === 'game_strategy_card_plays') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }) }) }
        }
        // game_players list query (id, strategy_card, passed)
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS, error: null }) }) }) }
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        selections: { bio_stims_target: { type: 'planet', name: 'Nestphar' } },
      }))
      expect(res.status).toBe(200)
      expect(planetUpdated).toBe(true)
      expect(bioStimsExhausted).toBe(true)
    })

    it('un-exhausts target technology and exhausts Bio-Stims', async () => {
      let capturedExhausted = null
      db.from.mockImplementation((table) => {
        if (table === 'games') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID }, error: null }) }) }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        if (table === 'game_players') {
          return {
            select: vi.fn().mockImplementation((cols) => {
              if (cols.includes('second_action_available')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { ...BASE_CALLER, technologies: ['Bio-Stims', 'Graviton Laser System'], exhausted_technologies: ['Graviton Laser System'] },
                        error: null,
                      }),
                    }),
                  }),
                }
              }
              return { eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS, error: null }) }) }
            }),
            update: vi.fn().mockImplementation((data) => {
              if (data.exhausted_technologies) capturedExhausted = data.exhausted_technologies
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
        if (table === 'game_strategy_card_plays') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }) }) }
        }
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS, error: null }) }) }) }
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        selections: { bio_stims_target: { type: 'technology', name: 'Graviton Laser System' } },
      }))
      expect(res.status).toBe(200)
      // Graviton should be removed, Bio-Stims should be added
      expect(capturedExhausted).not.toContain('Graviton Laser System')
      expect(capturedExhausted).toContain('Bio-Stims')
    })
  })

  it('calls logEvent with correct event_type on success', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'end_turn' }))
  })
})

describe('phase 30 — Fleet Logistics and Bio-Stims (alternate mockDb)', () => {
  const BASE_GAME_P30 = { id: GAME_ID, phase: 'action', active_player_id: PLAYER_ID }
  const ALL_PLAYERS_P30 = [{ id: PLAYER_ID, strategy_card: 4, passed: false }]
  const BASE_CALLER_P30 = { id: PLAYER_ID, technologies: [], exhausted_technologies: [], second_action_available: false }

  function mockDbP30({ callerPlayer, planetUpdateCapture = null, playerUpdateCapture = null } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME_P30, error: null }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('second_action_available')) {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                  }),
                }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: ALL_PLAYERS_P30, error: null }),
              }),
            }
          }),
          update: vi.fn().mockImplementation((data) => {
            if (playerUpdateCapture) playerUpdateCapture(data)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_strategy_card_plays') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_strategy_card_responses') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
      }
      if (table === 'game_player_planets') {
        return {
          update: vi.fn().mockImplementation((data) => {
            if (planetUpdateCapture) planetUpdateCapture(data)
            return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
          }),
        }
      }
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getHeldNotes.mockResolvedValue([])
    returnNote.mockResolvedValue(undefined)
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('Fleet Logistics: first end-turn grants second action and does not end turn', async () => {
    let capturedUpdate = null
    mockDbP30({
      callerPlayer: { id: PLAYER_ID, technologies: ['Fleet Logistics'], exhausted_technologies: [], second_action_available: false },
      playerUpdateCapture: (d) => { capturedUpdate = d },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.second_action_available).toBe(true)
    expect(capturedUpdate?.second_action_available).toBe(true)
  })

  it('Fleet Logistics: second end-turn clears flag and ends turn normally', async () => {
    let capturedUpdate = null
    mockDbP30({
      callerPlayer: { id: PLAYER_ID, technologies: ['Fleet Logistics'], exhausted_technologies: [], second_action_available: true },
      playerUpdateCapture: (d) => { capturedUpdate = d },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(capturedUpdate?.second_action_available).toBe(false)
  })

  it('Bio-Stims: readies a planet and exhausts Bio-Stims', async () => {
    let capturedPlanetUpdate = null
    let capturedPlayerUpdate = null
    mockDbP30({
      callerPlayer: { id: PLAYER_ID, technologies: ['Bio-Stims'], exhausted_technologies: [], second_action_available: false },
      planetUpdateCapture: (d) => { capturedPlanetUpdate = d },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      selections: { bio_stims_target: { type: 'planet', name: 'Mecatol Rex' } },
    }))
    expect(res.status).toBe(200)
    expect(capturedPlanetUpdate?.exhausted).toBe(false)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Bio-Stims')
  })

  it('Bio-Stims: readies a technology and exhausts Bio-Stims', async () => {
    let capturedPlayerUpdate = null
    mockDbP30({
      callerPlayer: {
        id: PLAYER_ID,
        technologies: ['Bio-Stims', 'Neural Motivator'],
        exhausted_technologies: ['Neural Motivator'],
        second_action_available: false,
      },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      selections: { bio_stims_target: { type: 'technology', name: 'Neural Motivator' } },
    }))
    expect(res.status).toBe(200)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Bio-Stims')
    expect(capturedPlayerUpdate?.exhausted_technologies).not.toContain('Neural Motivator')
  })
})

describe('phase 39b — promissory note effects on turn advance', () => {
  const CALLER_PLAYER_ID = 'caller-uuid'
  const NEXT_PLAYER_ID = 'next-uuid'
  const HOLDER_ID = 'holder-uuid'
  const NOTE_INSTANCE = 'note-instance-uuid'
  const SYSTEM_KEY = '1,0'
  const TILE_ID = 'tile-uuid'

  const BASE_GAME_P39 = {
    id: GAME_ID,
    phase: 'action',
    active_player_id: CALLER_PLAYER_ID,
    map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } },
  }

  const BASE_CALLER_P39 = {
    id: CALLER_PLAYER_ID,
    technologies: [],
    exhausted_technologies: [],
    second_action_available: false,
  }

  // Two non-passed players: caller then next
  const ALL_PLAYERS_P39 = [
    { id: CALLER_PLAYER_ID, strategy_card: 2, passed: false },
    { id: NEXT_PLAYER_ID, strategy_card: 4, passed: false },
  ]

  function buildDbMockP39({
    callerPlayer = BASE_CALLER_P39,
    allPlayers = ALL_PLAYERS_P39,
    gamePlayersSelectById = {},
    gamePlayerPlanetsMock = null,
    gamePlayerUnitsMock = null,
    gamePlayersUpdateCapture = null,
  } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME_P39, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((cols) => {
            if (cols.includes('second_action_available')) {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                  }),
                }),
              }
            }
            if (cols.includes('strategy_card') && cols.includes('passed')) {
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
                }),
              }
            }
            return {
              eq: vi.fn().mockImplementation((field, value) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: gamePlayersSelectById[value] ?? null,
                  error: null,
                }),
              })),
            }
          }),
          update: vi.fn().mockImplementation((payload) => {
            if (gamePlayersUpdateCapture) gamePlayersUpdateCapture.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_strategy_card_plays') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_strategy_card_responses') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }),
        }
      }
      if (table === 'game_player_planets') {
        if (gamePlayerPlanetsMock) return gamePlayerPlanetsMock
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_player_units') {
        if (gamePlayerUnitsMock) return gamePlayerUnitsMock
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return nullSafeChain()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getHeldNotes.mockResolvedValue([])
    returnNote.mockResolvedValue(undefined)
    requireAuth.mockResolvedValue(USER_ID)
  })

  // ─── CYBERNETIC ENHANCEMENTS ──────────────────────────────────────────────────

  describe('Cybernetic Enhancements', () => {
    it('Cybernetic Enhancements held, L1Z1X (owner) is about to act → owner −1 strategy token, holder +1, note returned', async () => {
      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Cybernetic Enhancements') {
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: NEXT_PLAYER_ID }]
        }
        return []
      })

      const updateCalls = []
      buildDbMockP39({
        gamePlayersSelectById: {
          [NEXT_PLAYER_ID]: { command_tokens: { tactic_total: 3, fleet: 2, strategy: 2 } },
          [HOLDER_ID]: { command_tokens: { tactic_total: 2, fleet: 1, strategy: 0 } },
        },
        gamePlayersUpdateCapture: updateCalls,
      })

      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.advanced).toBe(true)

      // Owner gets −1 strategy (2 → 1)
      const ownerTokenUpdate = updateCalls.find(
        (c) => c.command_tokens?.strategy === 1 && c.command_tokens?.tactic_total === 3
      )
      expect(ownerTokenUpdate).toBeDefined()

      // Holder gets +1 strategy (0 → 1)
      const holderTokenUpdate = updateCalls.find(
        (c) => c.command_tokens?.strategy === 1 && c.command_tokens?.fleet === 1
      )
      expect(holderTokenUpdate).toBeDefined()

      // Note returned to owner
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, NEXT_PLAYER_ID, expect.anything())
    })

    it('Cybernetic Enhancements held, owner is NOT the next player → no effect', async () => {
      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Cybernetic Enhancements') {
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: 'some-other-player' }]
        }
        return []
      })

      buildDbMockP39()

      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)
      expect(returnNote).not.toHaveBeenCalledWith(NOTE_INSTANCE, expect.anything(), expect.anything())
    })
  })

  // ─── MILITARY SUPPORT ─────────────────────────────────────────────────────────

  describe('Military Support', () => {
    it('Military Support held, Sol (owner) is about to act → Sol −1 strategy token, holder gets 2 infantry, note returned', async () => {
      const PLANET = 'Mecatol Rex'

      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Military Support') {
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: NEXT_PLAYER_ID }]
        }
        return []
      })

      const updateCalls = []
      const insertCalls = []

      const gamePlayerPlanetsMock = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { tile_id: TILE_ID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }),
        }),
      }

      const gamePlayerUnitsMock = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          updateCalls.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
        insert: vi.fn().mockImplementation((payload) => {
          insertCalls.push(payload)
          return Promise.resolve({ error: null })
        }),
      }

      buildDbMockP39({
        gamePlayersSelectById: {
          [NEXT_PLAYER_ID]: { command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
        },
        gamePlayerPlanetsMock,
        gamePlayerUnitsMock,
        gamePlayersUpdateCapture: updateCalls,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        selections: { infantry_planet: PLANET },
      }))
      expect(res.status).toBe(200)

      // Owner (Sol) −1 strategy token (1 → 0)
      const ownerTokenUpdate = updateCalls.find(
        (c) => c.command_tokens?.strategy === 0
      )
      expect(ownerTokenUpdate).toBeDefined()

      // Holder gets 2 infantry inserted
      expect(insertCalls).toHaveLength(1)
      expect(insertCalls[0].unit_type).toBe('infantry')
      expect(insertCalls[0].count).toBe(2)
      expect(insertCalls[0].on_planet).toBe(PLANET)
      expect(insertCalls[0].player_id).toBe(HOLDER_ID)
      expect(insertCalls[0].system_key).toBe(SYSTEM_KEY)

      // Note returned
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, NEXT_PLAYER_ID, expect.anything())
    })

    it('Military Support held, existing infantry on planet → count incremented by 2', async () => {
      const PLANET = 'Mecatol Rex'
      const EXISTING_UNIT_ID = 'unit-uuid'

      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Military Support') {
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: NEXT_PLAYER_ID }]
        }
        return []
      })

      const updateCalls = []

      const gamePlayerPlanetsMock = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { tile_id: TILE_ID },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }),
        }),
      }

      const gamePlayerUnitsMock = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: EXISTING_UNIT_ID, count: 3 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          updateCalls.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }

      buildDbMockP39({
        gamePlayersSelectById: {
          [NEXT_PLAYER_ID]: { command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
        },
        gamePlayerPlanetsMock,
        gamePlayerUnitsMock,
        gamePlayersUpdateCapture: updateCalls,
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        selections: { infantry_planet: PLANET },
      }))
      expect(res.status).toBe(200)

      // Unit count incremented by 2 (3 → 5)
      const unitUpdate = updateCalls.find((c) => c.count === 5)
      expect(unitUpdate).toBeDefined()
    })
  })

  // ─── SPY NET ──────────────────────────────────────────────────────────────────

  describe('Spy Net', () => {
    it('Spy Net held, holder is the next player → Yssaril loses 1 card, holder gains 1, note returned', async () => {
      // NEXT_PLAYER_ID is the holder
      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Spy Net') {
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: NEXT_PLAYER_ID, ownerPlayerId: HOLDER_ID }]
        }
        return []
      })

      const updateCalls = []
      buildDbMockP39({
        gamePlayersSelectById: {
          [HOLDER_ID]: { action_card_count: 5 },   // Yssaril (owner) has 5 cards
          [NEXT_PLAYER_ID]: { action_card_count: 2 }, // holder (next player) has 2 cards
        },
        gamePlayersUpdateCapture: updateCalls,
      })

      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)

      // Owner (Yssaril) loses 1 card: 5 → 4
      const yssarilUpdate = updateCalls.find((c) => c.action_card_count === 4)
      expect(yssarilUpdate).toBeDefined()

      // Holder gains 1 card: 2 → 3
      const holderUpdate = updateCalls.find((c) => c.action_card_count === 3)
      expect(holderUpdate).toBeDefined()

      // Note returned to owner (Yssaril)
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE, HOLDER_ID, expect.anything())
    })

    it('Spy Net held, holder is NOT the next player → no effect', async () => {
      getHeldNotes.mockImplementation(async (_gameId, noteName) => {
        if (noteName === 'Spy Net') {
          // Holder is HOLDER_ID, not NEXT_PLAYER_ID
          return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: 'yssaril-uuid' }]
        }
        return []
      })

      buildDbMockP39()

      const res = await handler(makeRequest({ game_id: GAME_ID }))
      expect(res.status).toBe(200)
      expect(returnNote).not.toHaveBeenCalledWith(NOTE_INSTANCE, expect.anything(), expect.anything())
    })
  })

  // ─── NO HELD NOTES ────────────────────────────────────────────────────────────

  it('No held notes → turn advances normally, no note effects', async () => {
    getHeldNotes.mockResolvedValue([])
    buildDbMockP39()

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(returnNote).not.toHaveBeenCalled()
  })
})
