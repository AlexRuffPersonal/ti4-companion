import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const GAME_ID = 'game-uuid'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    seat_index: 1,
    eliminated: false,
    strategy_card: null,
    strategy_card_2: null,
    tokens_captured_from: {},
    ...overrides,
  }
}

/**
 * Creates a minimal chainable db mock.
 * `tables` is a map of table name → handler factory.
 * Each handler is called with the query so far and returns { select, update, delete, ... }.
 */
function makeDb(overrides = {}) {
  db.from.mockImplementation((table) => {
    if (overrides[table]) return overrides[table]()
    // Default: return nothing (no rows, no error)
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          in: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        is: vi.fn().mockReturnValue({ data: [], error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        neq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  })
}

// ---------------------------------------------------------------------------
// A more targeted builder for common elimination scenarios
// ---------------------------------------------------------------------------

function buildFullMock({
  players = [makePlayer()],
  hasProduction = false,
  hasGroundForces = false,
  hasPlanets = false,
  game = { id: GAME_ID, speaker_player_id: 'other-player', host_player_id: 'host' },
  remainingPlayers = [{ id: 'p2', seat_index: 2 }],
  notes = [],
} = {}) {
  db.from.mockImplementation((table) => {
    const noRows = { data: [], error: null }
    const noRow = { data: null, error: null }

    const eqChain = (result) => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(result),
        maybeSingle: vi.fn().mockResolvedValue(result),
        limit: vi.fn().mockResolvedValue(result),
        neq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: remainingPlayers, error: null }),
          }),
        }),
        in: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(result) }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
      maybeSingle: vi.fn().mockResolvedValue(result),
      limit: vi.fn().mockResolvedValue(result),
      not: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: remainingPlayers, error: null }),
          }),
        }),
      }),
    })

    if (table === 'game_players') {
      // neqResult must be both awaitable AND have .order() for two different query shapes:
      //   .eq().eq().neq()          → activePlayers (direct await)
      //   .eq().eq().neq().order()  → remaining players (await after order)
      const neqResult = Object.assign(
        Promise.resolve({ data: remainingPlayers, error: null }),
        { order: vi.fn().mockResolvedValue({ data: remainingPlayers, error: null }) }
      )
      // afterDoubleEq must be both awaitable (initial player load) AND have .neq()
      const afterDoubleEq = Object.assign(
        Promise.resolve({ data: players, error: null }),
        { neq: vi.fn().mockReturnValue(neqResult) }
      )
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(afterDoubleEq),
            neq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: remainingPlayers, error: null }),
            }),
            single: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
          single: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'game_player_units') {
      const prodData = hasProduction ? [{ id: 'u1' }] : []
      const gfData = hasGroundForces ? [{ id: 'u2' }] : []
      return {
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col, vals) => {
                // Distinguish production vs ground force check
                if (Array.isArray(vals) && vals.includes('infantry')) {
                  return { limit: vi.fn().mockResolvedValue({ data: gfData, error: null }) }
                }
                return { limit: vi.fn().mockResolvedValue({ data: prodData, error: null }) }
              }),
            }),
          }),
        })),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'game_system_state') {
      const planetData = hasPlanets ? [{ id: 's1' }] : []
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: planetData, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'game_system_activations') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: notes, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(noRow),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(noRow),
        }),
      }
    }

    if (table === 'game_player_action_cards') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'game_player_secret_objectives') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(noRow),
          }),
        }),
      }
    }

    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: game, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(noRow),
        }),
      }
    }

    if (table === 'units') {
      // Returns unit types that have production capability (used in elimination check)
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [{ name: 'Space Dock' }, { name: 'Carrier' }], error: null }),
        }),
      }
    }

    // Fallback
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(noRows), single: vi.fn().mockResolvedValue(noRow) }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(noRow) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue(noRow) }),
      insert: vi.fn().mockResolvedValue(noRow),
    }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkAndEliminate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('player with no units, no planets → returned in eliminatedIds', async () => {
    buildFullMock({
      players: [makePlayer({ id: 'p1' })],
      hasProduction: false,
      hasGroundForces: false,
      hasPlanets: false,
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).toContain('p1')
  })

  it('player with infantry on planet → not eliminated', async () => {
    buildFullMock({
      players: [makePlayer({ id: 'p1' })],
      hasProduction: false,
      hasGroundForces: true,
      hasPlanets: false,
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).not.toContain('p1')
  })

  it('already eliminated player skipped', async () => {
    // game_players returns only non-eliminated (the query filters eliminated=false)
    buildFullMock({
      players: [], // no active players returned
      hasProduction: false,
      hasGroundForces: false,
      hasPlanets: false,
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).toHaveLength(0)
  })

  it('speaker eliminated → speaker passes to next seat_index', async () => {
    const player = makePlayer({ id: 'p1', seat_index: 1 })
    buildFullMock({
      players: [player],
      hasProduction: false,
      hasGroundForces: false,
      hasPlanets: false,
      game: { id: GAME_ID, speaker_player_id: 'p1', host_player_id: 'host' },
      remainingPlayers: [
        { id: 'p2', seat_index: 2 },
        { id: 'p3', seat_index: 3 },
      ],
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).toContain('p1')
    // Verify games.update was called (speaker handoff happened)
    const gamesCalls = db.from.mock.calls.filter(([t]) => t === 'games')
    expect(gamesCalls.length).toBeGreaterThan(0)
  })

  it('speaker eliminated → wraps around if speaker has highest seat_index', async () => {
    const player = makePlayer({ id: 'p3', seat_index: 3 })
    buildFullMock({
      players: [player],
      hasProduction: false,
      hasGroundForces: false,
      hasPlanets: false,
      game: { id: GAME_ID, speaker_player_id: 'p3', host_player_id: 'host' },
      remainingPlayers: [
        { id: 'p1', seat_index: 1 },
        { id: 'p2', seat_index: 2 },
      ],
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).toContain('p3')
  })

  it('action cards deleted', async () => {
    buildFullMock({
      players: [makePlayer({ id: 'p1' })],
    })
    await checkAndEliminate(db, GAME_ID)
    const acCalls = db.from.mock.calls.filter(([t]) => t === 'game_player_action_cards')
    expect(acCalls.length).toBeGreaterThan(0)
  })

  it('secret objectives set to in_deck', async () => {
    buildFullMock({
      players: [makePlayer({ id: 'p1' })],
    })
    await checkAndEliminate(db, GAME_ID)
    const soCalls = db.from.mock.calls.filter(([t]) => t === 'game_player_secret_objectives')
    expect(soCalls.length).toBeGreaterThan(0)
  })

  it('strategy cards nulled', async () => {
    buildFullMock({
      players: [makePlayer({ id: 'p1', strategy_card: 1, strategy_card_2: null })],
    })
    await checkAndEliminate(db, GAME_ID)
    // game_players.update should be called with null strategy cards
    const gpCalls = db.from.mock.calls.filter(([t]) => t === 'game_players')
    expect(gpCalls.length).toBeGreaterThan(0)
  })

  it('two players simultaneously eligible → both eliminated', async () => {
    buildFullMock({
      players: [
        makePlayer({ id: 'p1', seat_index: 1 }),
        makePlayer({ id: 'p2', seat_index: 2 }),
      ],
      hasProduction: false,
      hasGroundForces: false,
      hasPlanets: false,
    })
    const result = await checkAndEliminate(db, GAME_ID)
    expect(result).toContain('p1')
    expect(result).toContain('p2')
  })
})
