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
  getHeldNotes: vi.fn(),
  returnNote: vi.fn(),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-end-turn/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const CALLER_PLAYER_ID = 'caller-uuid'
const NEXT_PLAYER_ID = 'next-uuid'
const HOLDER_ID = 'holder-uuid'
const NOTE_INSTANCE = 'note-instance-uuid'
const SYSTEM_KEY = '1,0'
const TILE_ID = 'tile-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-end-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GAME = {
  id: GAME_ID,
  phase: 'action',
  active_player_id: CALLER_PLAYER_ID,
  map_tiles: { [SYSTEM_KEY]: { tile_id: TILE_ID } },
}

const BASE_CALLER = {
  id: CALLER_PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
  second_action_available: false,
}

// Two non-passed players: caller then next
const ALL_PLAYERS = [
  { id: CALLER_PLAYER_ID, strategy_card: 2, passed: false },
  { id: NEXT_PLAYER_ID, strategy_card: 4, passed: false },
]

/**
 * Build a minimal db mock for the game-end-turn flow (no tech effects).
 * gamePlayersSelectById: map of player_id → data returned for .select().eq('id', ...) calls.
 * gamePlayerUnitsMocks: optional mock overrides for game_player_units table.
 * gamePlayerPlanetsMock: optional mock for game_player_planets table.
 * unitUpdateCapture / unitInsertCapture: optional capture arrays.
 */
function buildDbMock({
  callerPlayer = BASE_CALLER,
  allPlayers = ALL_PLAYERS,
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
            maybeSingle: vi.fn().mockResolvedValue({ data: BASE_GAME, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((cols) => {
          // Caller player query (by user_id) — selects columns with 'second_action_available'
          if (cols.includes('second_action_available')) {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }
          }
          // All-players order query (strategy_card, passed)
          if (cols.includes('strategy_card') && cols.includes('passed')) {
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
              }),
            }
          }
          // Per-player lookup by id (command_tokens, action_card_count etc.)
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
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  getHeldNotes.mockResolvedValue([])
  returnNote.mockResolvedValue(undefined)
})

// ─── CYBERNETIC ENHANCEMENTS ──────────────────────────────────────────────────

describe('game-end-turn Phase 39b — Cybernetic Enhancements', () => {
  it('Cybernetic Enhancements held, L1Z1X (owner) is about to act → owner −1 strategy token, holder +1, note returned', async () => {
    getHeldNotes.mockImplementation(async (_gameId, noteName) => {
      if (noteName === 'Cybernetic Enhancements') {
        return [{ instanceId: NOTE_INSTANCE, holderPlayerId: HOLDER_ID, ownerPlayerId: NEXT_PLAYER_ID }]
      }
      return []
    })

    const updateCalls = []
    buildDbMock({
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

    buildDbMock()

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalledWith(NOTE_INSTANCE, expect.anything(), expect.anything())
  })
})

// ─── MILITARY SUPPORT ─────────────────────────────────────────────────────────

describe('game-end-turn Phase 39b — Military Support', () => {
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

    buildDbMock({
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

    buildDbMock({
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

describe('game-end-turn Phase 39b — Spy Net', () => {
  it('Spy Net held, holder is the next player → Yssaril loses 1 card, holder gains 1, note returned', async () => {
    // NEXT_PLAYER_ID is the holder
    getHeldNotes.mockImplementation(async (_gameId, noteName) => {
      if (noteName === 'Spy Net') {
        return [{ instanceId: NOTE_INSTANCE, holderPlayerId: NEXT_PLAYER_ID, ownerPlayerId: HOLDER_ID }]
      }
      return []
    })

    const updateCalls = []
    buildDbMock({
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

    buildDbMock()

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(returnNote).not.toHaveBeenCalledWith(NOTE_INSTANCE, expect.anything(), expect.anything())
  })
})

// ─── NO HELD NOTES ────────────────────────────────────────────────────────────

describe('game-end-turn Phase 39b — no held notes', () => {
  it('No held notes → turn advances normally, no note effects', async () => {
    getHeldNotes.mockResolvedValue([])
    buildDbMock()

    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.advanced).toBe(true)
    expect(returnNote).not.toHaveBeenCalled()
  })
})
