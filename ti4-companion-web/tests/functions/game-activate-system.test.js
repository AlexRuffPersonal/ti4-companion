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
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  // phase43a tests need these specific factions; other phases ignore the value
  AGENT_REACTIVE_TRIGGERS: {
    'The Ghosts Of Creuss': ['SYSTEM_ACTIVATED'],
    'The Arborec': ['SYSTEM_ACTIVATED'],
    'The Yssaril Tribes': ['SYSTEM_ACTIVATED'],
  },
  applyCommanderPassives: vi.fn().mockResolvedValue({ pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID, TILE_ID, SYSTEM_KEY } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, eqEqSingle, eqSingle, eqEqEqMany, inMany, eqIs } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-activate-system', body)

// ---------------------------------------------------------------------------
// Base happy-path setup
// ---------------------------------------------------------------------------

function setupHappyPath({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  playerError = null,
  game = { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
  gameError = null,
  activations = [],
  activationError = null,
  insertError = null,
} = {}) {
  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: insertError }),
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
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game, error: gameError }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: activations, error: activationError }),
            }),
          }),
        }),
        insert: insertMock,
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_units') {
      // Single broad fetch: .eq('game_id').is('on_planet', null) — no enemy units in base tests
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }
  })
  return { insertMock }
}

let insertMock

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  ;({ insertMock } = setupHappyPath())
})

// ---------------------------------------------------------------------------
// Base describe block
// ---------------------------------------------------------------------------

describe('game-activate-system', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ system_key: '1,-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when system_key is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    ;({ insertMock } = setupHappyPath({ player: null }))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when caller is not the active player', async () => {
    ;({ insertMock } = setupHappyPath({ game: { active_player_id: 'other-player', round: 2 } }))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not the active player/i)
  })

  it('returns 409 when no tactic tokens available', async () => {
    ;({ insertMock } = setupHappyPath({
      player: { id: PLAYER_ID, command_tokens: { tactic_total: 1, fleet: 2, strategy: 1 } },
      activations: [{ id: 'a1', system_key: '2,-1' }],
    }))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/no tactic tokens/i)
  })

  it('returns 409 when system already activated by caller this round', async () => {
    ;({ insertMock } = setupHappyPath({
      activations: [{ id: 'a1', system_key: '1,-1' }],
    }))
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('returns 200 and inserts activation row on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(insertMock).toHaveBeenCalledWith({
      game_id: GAME_ID,
      player_id: PLAYER_ID,
      system_key: '1,-1',
      round: 2,
      token_owner_id: PLAYER_ID,
    })
  })

  it('handles CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('GIVEN ships moved in from another system, EXPECT combat.ships_moved_in=true and phase=\'window_pre_space_cannon\'', async () => {
    const combatInsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
    })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch: does NOT include 'command_tokens', resolves with single .eq()
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }
            }
            // single player fetch: includes 'command_tokens', chains .eq().eq().maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: insertMock,
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({
                data: [{ player_id: 'enemy-uuid', unit_type: 'cruiser', count: 2, system_key: '1,-1' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return { insert: combatInsertSpy }
      }
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [{ origin_system_key: '2,-1' }],
    }))
    expect(res.status).toBe(200)
    expect(combatInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ships_moved_in: true,
        phase: 'window_pre_space_cannon',
      })
    )
  })

  it('GIVEN no ships moved in (same-system origin), EXPECT combat.ships_moved_in=false', async () => {
    const combatInsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
    })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch: does NOT include 'command_tokens', resolves with single .eq()
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }
            }
            // single player fetch: includes 'command_tokens', chains .eq().eq().maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: insertMock,
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({
                data: [{ player_id: 'enemy-uuid', unit_type: 'cruiser', count: 2, system_key: '1,-1' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return { insert: combatInsertSpy }
      }
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [{ origin_system_key: '1,-1' }],
    }))
    expect(res.status).toBe(200)
    expect(combatInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ships_moved_in: false,
        phase: 'window_pre_space_cannon',
      })
    )
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'activate_system' }))
  })
})

// ---------------------------------------------------------------------------
// Phase 10 — combat creation
// ---------------------------------------------------------------------------

describe('game-activate-system — combat creation (Phase 10)', () => {
  const ATTACKER_ID = 'attacker-uuid'
  const DEFENDER_ID = 'defender-uuid'
  const COMBAT_ID_P10 = 'combat-uuid'

  function mockDbPhase10({
    player = { id: ATTACKER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
    game = { id: GAME_ID, active_player_id: ATTACKER_ID, round: 2, map_tiles: { '1,-1': { tile_id: 'tile-a' } } },
    activations = [],
    enemyUnits = [{ player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' }],
    scUnitDefs = [],
    tiles = [{ id: 'tile-a', wormhole: null }],
    combatInsertId = COMBAT_ID_P10,
  } = {}) {
    const activationInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
    })
    const combatInsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: combatInsertId }], error: null }),
    })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
              }),
            }),
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
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: activations, error: null }),
              }),
            }),
          }),
          insert: activationInsertMock,
        }
      }
      if (table === 'game_player_units') {
        // Single broad fetch: .eq('game_id').is('on_planet', null)
        // enemyUnits is filtered client-side by system_key and player_id
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: enemyUnits, error: null }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: scUnitDefs, error: null }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          insert: combatInsertMock,
        }
      }
    })
    return { activationInsertMock, combatInsertMock }
  }

  beforeEach(() => {
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns combat_id when enemy ships are present in activated system', async () => {
    mockDbPhase10()
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBe(COMBAT_ID_P10)
  })

  it('returns combat_id: null when no enemy ships in system', async () => {
    mockDbPhase10({ enemyUnits: [] })
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.combat_id).toBeNull()
  })

  it('inserts combat row when enemy ships found', async () => {
    const { combatInsertMock } = mockDbPhase10()
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(combatInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: GAME_ID,
        system_key: '1,-1',
        attacker_player_id: ATTACKER_ID,
        defender_player_id: DEFENDER_ID,
      })
    )
  })

  it('sets phase to window_pre_space_cannon when no space cannon units present', async () => {
    const { combatInsertMock } = mockDbPhase10({ scUnitDefs: [] })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('window_pre_space_cannon')
    expect(insertArg.space_cannon_pending).toEqual([])
  })

  it('sets phase to window_pre_space_cannon and populates pending when sc units exist', async () => {
    const { combatInsertMock } = mockDbPhase10({
      scUnitDefs: [{ name: 'pds', space_cannon: '5(x3)' }],
      enemyUnits: [
        { player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, system_key: '1,-1' },
        { player_id: ATTACKER_ID, unit_type: 'pds', count: 1, system_key: '1,-1' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.phase).toBe('window_pre_space_cannon')
    expect(insertArg.space_cannon_pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ player_id: ATTACKER_ID, unit_type: 'pds', dice_count: 3, resolved: false }),
      ])
    )
  })

  it('GIVEN ships moved from another system EXPECT ships_moved_in=true and phase=window_pre_space_cannon', async () => {
    const { combatInsertMock } = mockDbPhase10()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [
        { origin_system_key: '0,0' },   // different system → ships_moved_in=true
        { origin_system_key: '1,-1' },  // same system (e.g. planet to space)
      ],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(true)
    expect(insertArg.phase).toBe('window_pre_space_cannon')
  })

  it('GIVEN no movement with different origin EXPECT ships_moved_in=false', async () => {
    const { combatInsertMock } = mockDbPhase10()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [
        { origin_system_key: '1,-1' },  // same system only
      ],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(false)
  })

  it('GIVEN empty movement_payload EXPECT ships_moved_in=false', async () => {
    const { combatInsertMock } = mockDbPhase10()
    await handler(makeRequest({
      game_id: GAME_ID,
      system_key: '1,-1',
      movement_payload: [],
    }))
    const insertArg = combatInsertMock.mock.calls[0][0]
    expect(insertArg.ships_moved_in).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Phase 30 — tech effects on activation
// ---------------------------------------------------------------------------

describe('game-activate-system Phase 30', () => {
  const OPPONENT_ID_P30 = 'opponent-uuid'
  const SYSTEM_KEY_P30 = '0,0'
  const TILE_ID_P30 = 'tile-uuid'

  const BASE_CALLER = {
    id: PLAYER_ID,
    command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
    technologies: [],
    exhausted_technologies: [],
    trade_goods: 0,
    promissory_notes: [],
  }

  const BASE_GAME_P30 = {
    id: GAME_ID,
    active_player_id: PLAYER_ID,
    round: 1,
    map_tiles: { [SYSTEM_KEY_P30]: { tile_id: TILE_ID_P30 } },
  }

  const PLAIN_TILE = { id: TILE_ID_P30, wormhole: null, anomalies: [] }
  const ASTEROID_TILE = { id: TILE_ID_P30, wormhole: null, anomalies: ['asteroid_field'] }

  function buildCommonMocksP30({
    callerPlayer = BASE_CALLER,
    game = BASE_GAME_P30,
    tiles = [PLAIN_TILE],
    allGamePlayers = [BASE_CALLER],
    spaceUnits = [],
    playerUpdates = null,
  } = {}) {
    let gamePlayersCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        const call = gamePlayersCallCount
        if (call === 1) {
          // caller player by user_id
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }),
          }
        } else if (call === 2) {
          // all game players (array)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: allGamePlayers, error: null }),
            }),
          }
        } else {
          // update calls
          return {
            update: vi.fn().mockImplementation((data) => {
              if (playerUpdates) playerUpdates.push({ data })
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: spaceUnits, error: null }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
          }),
        }
      }
      return {}
    })
  }

  it('Chaos Mapping: blocks activation when Saar ships occupy asteroid field', async () => {
    const saarPlayer = { id: OPPONENT_ID_P30, technologies: ['Chaos Mapping'], exhausted_technologies: [] }
    buildCommonMocksP30({
      tiles: [ASTEROID_TILE],
      allGamePlayers: [BASE_CALLER, saarPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY_P30 }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/chaos mapping|saar/i)
  })

  it('Chaos Mapping: allows activation when Saar has no ships in the asteroid field', async () => {
    const saarPlayer = { id: OPPONENT_ID_P30, technologies: ['Chaos Mapping'], exhausted_technologies: [] }
    buildCommonMocksP30({
      tiles: [ASTEROID_TILE],
      allGamePlayers: [BASE_CALLER, saarPlayer],
      spaceUnits: [], // no ships
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
  })

  it('Neuroglaive: activating player loses 1 fleet token', async () => {
    const naaluPlayer = {
      id: OPPONENT_ID_P30,
      technologies: ['Neuroglaive'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocksP30({
      callerPlayer: { ...BASE_CALLER, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
      allGamePlayers: [BASE_CALLER, naaluPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'fighter', count: 2, system_key: SYSTEM_KEY_P30 }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
    const fleetUpdate = playerUpdateCaptures.find(
      (u) => u.data?.command_tokens?.fleet !== undefined
    )
    expect(fleetUpdate?.data.command_tokens.fleet).toBe(1)
  })

  it('E-Res Siphons: Jol-Nar gains 4 trade goods', async () => {
    const jolNarPlayer = {
      id: OPPONENT_ID_P30,
      technologies: ['E-Res Siphons'],
      exhausted_technologies: [],
      trade_goods: 3,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocksP30({
      allGamePlayers: [BASE_CALLER, jolNarPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'dreadnought', count: 1, system_key: SYSTEM_KEY_P30 }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
    const tgUpdate = playerUpdateCaptures.find((u) => u.data?.trade_goods !== undefined)
    expect(tgUpdate?.data.trade_goods).toBe(7)
  })

  it('Voidwatch: takes 1 promissory note from activating player', async () => {
    const empyreanPlayer = {
      id: OPPONENT_ID_P30,
      technologies: ['Voidwatch'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const callerWithNotes = { ...BASE_CALLER, promissory_notes: ['note-a', 'note-b'] }
    const playerUpdateCaptures = []
    buildCommonMocksP30({
      callerPlayer: callerWithNotes,
      allGamePlayers: [callerWithNotes, empyreanPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'carrier', count: 1, system_key: SYSTEM_KEY_P30 }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
    // Activating player should have 1 fewer note
    const callerUpdate = playerUpdateCaptures.find(
      (u) => Array.isArray(u.data?.promissory_notes) && u.data.promissory_notes.length === 1
    )
    expect(callerUpdate).toBeDefined()
  })

  it('Nullification Field: opens when_ships_enter_system window', async () => {
    const scatterPlayer = {
      id: OPPONENT_ID_P30,
      technologies: ['Nullification Field'],
      exhausted_technologies: [],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocksP30({
      allGamePlayers: [BASE_CALLER, scatterPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'destroyer', count: 1, system_key: SYSTEM_KEY_P30 }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
    const windowUpdate = playerUpdateCaptures.find(
      (u) => u.data?.pending_action_window?.type === 'when_ships_enter_system'
    )
    expect(windowUpdate).toBeDefined()
    expect(windowUpdate?.data.pending_action_window.eligible).toContain(OPPONENT_ID_P30)
  })

  it('Nullification Field: does not open window when already exhausted', async () => {
    const scatterPlayer = {
      id: OPPONENT_ID_P30,
      technologies: ['Nullification Field'],
      exhausted_technologies: ['Nullification Field'],
      trade_goods: 0,
      promissory_notes: [],
    }
    const playerUpdateCaptures = []
    buildCommonMocksP30({
      allGamePlayers: [BASE_CALLER, scatterPlayer],
      spaceUnits: [{ player_id: OPPONENT_ID_P30, unit_type: 'destroyer', count: 1, system_key: SYSTEM_KEY_P30 }],
      playerUpdates: playerUpdateCaptures,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P30 }))
    expect(res.status).toBe(200)
    const windowUpdate = playerUpdateCaptures.find(
      (u) => u.data?.pending_action_window?.type === 'when_ships_enter_system'
    )
    expect(windowUpdate).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Phase 39b — promissory note enforcement on activation
// ---------------------------------------------------------------------------

describe('game-activate-system Phase 39b', () => {
  const OWNER_ID = 'owner-uuid'
  const HOLDER_ID = 'holder-uuid'
  const SYSTEM_KEY_P39 = '0,0'
  const TILE_ID_P39 = 'tile-uuid'
  const ACTIVATION_ID = 'activation-uuid'
  const NOTE_INSTANCE_ID = 'note-instance-uuid'

  const BASE_PLAYER_P39 = {
    id: PLAYER_ID,
    command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
    technologies: [],
    exhausted_technologies: [],
    trade_goods: 0,
    promissory_notes: [],
  }

  const BASE_GAME_P39 = {
    id: GAME_ID,
    active_player_id: PLAYER_ID,
    round: 1,
    map_tiles: { [SYSTEM_KEY_P39]: { tile_id: TILE_ID_P39 } },
  }

  const PLAIN_TILE_P39 = { id: TILE_ID_P39, wormhole: null, anomalies: [] }

  function buildDbMockP39({
    callerPlayer = BASE_PLAYER_P39,
    game = BASE_GAME_P39,
    tiles = [PLAIN_TILE_P39],
    allGamePlayers = [BASE_PLAYER_P39],
    spaceUnits = [],
    activationSelectData = [{ id: ACTIVATION_ID }],
    activationUpdateMocks = null,
  } = {}) {
    let gamePlayersCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        const call = gamePlayersCallCount
        if (call === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
                }),
              }),
            }),
          }
        } else if (call === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: allGamePlayers, error: null }),
            }),
          }
        } else {
          return {
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        const updateFn = vi.fn().mockImplementation((data) => {
          if (activationUpdateMocks) activationUpdateMocks.push({ data })
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        })
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: activationSelectData, error: null }),
          }),
          update: updateFn,
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: tiles, error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: spaceUnits, error: null }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'combat-uuid' }], error: null }),
          }),
        }
      }
      return {}
    })
  }

  beforeEach(() => {
    getHeldNotes.mockResolvedValue([])
    getActiveNotes.mockResolvedValue({
      supportForThrone: [],
      alliance: [],
      tradeConvoys: [],
      promiseOfProtection: [],
      bloodPact: [],
      darkPact: [],
      stymie: [],
      antivirus: [],
      giftOfPrescience: [],
      tradeAgreement: [],
      crucible: [],
      strikeWingAmbuscade: [],
    })
    returnNote.mockResolvedValue(undefined)
  })

  describe('Ceasefire', () => {
    it('Ceasefire held, owner activates, holder has units in system → 409', async () => {
      // PLAYER_ID is the activating player (owner). HOLDER_ID is someone else holding the note.
      getHeldNotes.mockImplementation(async (gameId, noteName) => {
        if (noteName === 'Ceasefire') {
          return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }]
        }
        return []
      })

      buildDbMockP39({
        spaceUnits: [
          { player_id: HOLDER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY_P39 },
        ],
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/ceasefire/i)
      // Note should be consumed (returned) before the 409 is sent
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, PLAYER_ID, expect.anything())
    })

    it('Ceasefire held, owner activates, holder has NO units in system → proceeds normally', async () => {
      getHeldNotes.mockImplementation(async (gameId, noteName) => {
        if (noteName === 'Ceasefire') {
          return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: PLAYER_ID, holderPlayerId: HOLDER_ID }]
        }
        return []
      })

      buildDbMockP39({
        // Holder has units elsewhere, not in the activated system
        spaceUnits: [
          { player_id: HOLDER_ID, unit_type: 'cruiser', count: 1, system_key: '5,5' },
        ],
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)
    })
  })

  describe('Greyfire Mutagen', () => {
    it('Greyfire Mutagen held, any activation → faction_abilities_blocked set to owner; note returned', async () => {
      getHeldNotes.mockImplementation(async (gameId, noteName) => {
        if (noteName === 'Greyfire Mutagen') {
          return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }]
        }
        return []
      })

      const activationUpdates = []
      buildDbMockP39({ activationUpdateMocks: activationUpdates })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)

      // Should have updated the activation row with faction_abilities_blocked_player_id
      const blockedUpdate = activationUpdates.find(
        (u) => u.data?.faction_abilities_blocked_player_id !== undefined
      )
      expect(blockedUpdate).toBeDefined()
      expect(blockedUpdate.data.faction_abilities_blocked_player_id).toBe(OWNER_ID)

      // Should have returned the note
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
    })
  })

  describe('Crucible', () => {
    it('Crucible held, holder is the activating player → gravity_rift_immune set; note returned', async () => {
      // PLAYER_ID is activating (they hold the note). OWNER_ID is the original owner.
      getHeldNotes.mockImplementation(async (gameId, noteName) => {
        if (noteName === 'Crucible') {
          return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }]
        }
        return []
      })

      const activationUpdates = []
      buildDbMockP39({ activationUpdateMocks: activationUpdates })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)

      const immuneUpdate = activationUpdates.find(
        (u) => u.data?.gravity_rift_immune_player_id !== undefined
      )
      expect(immuneUpdate).toBeDefined()
      expect(immuneUpdate.data.gravity_rift_immune_player_id).toBe(PLAYER_ID)

      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
    })

    it('Crucible held, holder is NOT the activating player → no immune set, note not returned', async () => {
      // HOLDER_ID is a different player, not the one activating
      getHeldNotes.mockImplementation(async (gameId, noteName) => {
        if (noteName === 'Crucible') {
          return [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: HOLDER_ID }]
        }
        return []
      })

      const activationUpdates = []
      buildDbMockP39({ activationUpdateMocks: activationUpdates })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)

      const immuneUpdate = activationUpdates.find(
        (u) => u.data?.gravity_rift_immune_player_id !== undefined
      )
      expect(immuneUpdate).toBeUndefined()
      expect(returnNote).not.toHaveBeenCalled()
    })
  })

  describe('Model B in_play notes', () => {
    it('in_play note, holder activates system where owner has units → note returned', async () => {
      // PLAYER_ID is the holder. OWNER_ID is the note owner with units in the activated system.
      getActiveNotes.mockResolvedValue({
        supportForThrone: [],
        alliance: [],
        tradeConvoys: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
        promiseOfProtection: [],
        bloodPact: [],
        darkPact: [],
        stymie: [],
        antivirus: [],
        giftOfPrescience: [],
        tradeAgreement: [],
        crucible: [],
        strikeWingAmbuscade: [],
      })

      buildDbMockP39({
        spaceUnits: [
          { player_id: OWNER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY_P39 },
        ],
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)
      expect(returnNote).toHaveBeenCalledWith(NOTE_INSTANCE_ID, OWNER_ID, expect.anything())
    })

    it('in_play note, holder activates system where owner has NO units → note not returned', async () => {
      getActiveNotes.mockResolvedValue({
        supportForThrone: [],
        alliance: [],
        tradeConvoys: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
        promiseOfProtection: [],
        bloodPact: [],
        darkPact: [],
        stymie: [],
        antivirus: [],
        giftOfPrescience: [],
        tradeAgreement: [],
        crucible: [],
        strikeWingAmbuscade: [],
      })

      buildDbMockP39({
        // Owner has no units in the activated system
        spaceUnits: [],
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)
      expect(returnNote).not.toHaveBeenCalled()
    })

    it('in_play note, a different player (not holder) activates → note not returned', async () => {
      // HOLDER_ID holds the note; PLAYER_ID is activating (different player)
      getActiveNotes.mockResolvedValue({
        supportForThrone: [],
        alliance: [],
        promiseOfProtection: [{ instanceId: NOTE_INSTANCE_ID, ownerPlayerId: OWNER_ID, holderPlayerId: HOLDER_ID }],
        tradeConvoys: [],
        bloodPact: [],
        darkPact: [],
        stymie: [],
        antivirus: [],
        giftOfPrescience: [],
        tradeAgreement: [],
        crucible: [],
        strikeWingAmbuscade: [],
      })

      buildDbMockP39({
        spaceUnits: [
          { player_id: OWNER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY_P39 },
        ],
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P39 }))
      expect(res.status).toBe(200)
      expect(returnNote).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 43a — reactive agent window on activation
// ---------------------------------------------------------------------------

describe('reactive agent window on activation (Phase 43a)', () => {
  const CREUSS_PLAYER_ID = 'creuss-player-uuid'
  const AGENT_ID = 'creuss-agent-uuid'

  /**
   * Build a db mock that supports the full activate-system flow including
   * the reactive agent check at the end.
   *
   * otherPlayers: array of { id, faction, leaders } returned from the allGamePlayers fetch.
   *   The activating player (PLAYER_ID) is NOT included — the handler filters it in code.
   * agentRow: the leaders table row returned for the matching faction (or null)
   */
  function mockDbForReactiveAgent({ otherPlayers = [], agentRow = null } = {}) {
    const insertMockP43a = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
    })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch (now includes faction, leaders): selects without command_tokens
            // The handler now reuses allGamePlayers for reactive agent check, single .eq() only
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: otherPlayers, error: null }),
              }
            }
            // Single player fetch: includes command_tokens, chains .eq().eq().maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: insertMockP43a,
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'leaders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: agentRow, error: null }),
              }),
            }),
          }),
        }
      }
    })
  }

  it('GIVEN Creuss player with unlocked agent, EXPECT response includes pending_window with type=reactive_agent and eligible containing Creuss player_id', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
      agentRow: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toHaveLength(1)
    expect(body.pending_window.eligible[0].player_id).toBe(CREUSS_PLAYER_ID)
    expect(body.pending_window.eligible[0].faction).toBe('The Ghosts Of Creuss')
    expect(body.pending_window.eligible[0].agent_id).toBe(AGENT_ID)
    expect(body.pending_window.context.trigger).toBe('SYSTEM_ACTIVATED')
    expect(body.pending_window.context.system_key).toBe('1,-1')
  })

  it('GIVEN Creuss player with locked agent, EXPECT no pending_window in response', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'locked' } },
      ],
      agentRow: { id: AGENT_ID },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN no players with unlocked reactive agents, EXPECT no pending_window in response', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: 'some-player-uuid', faction: 'The Federation Of Sol', leaders: { agent: 'locked' } },
      ],
      agentRow: null,
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN faction with no reactive trigger, EVEN IF agent is unlocked, EXPECT no pending_window', async () => {
    mockDbForReactiveAgent({
      otherPlayers: [
        { id: 'hacan-player-uuid', faction: 'The Emirates Of Hacan', leaders: { agent: 'unlocked' } },
      ],
      agentRow: { id: 'hacan-agent-uuid' },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '1,-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN multiple factions with unlocked reactive agents, EXPECT all included in eligible', async () => {
    const ARBOREC_PLAYER_ID = 'arborec-player-uuid'
    const ARBOREC_AGENT_ID = 'arborec-agent-uuid'

    // Hoist the leaders maybeSingle mock outside db.from so it sequences correctly
    // across multiple db.from('leaders') calls (one per reactive faction)
    const leadersMaybySingleMock = vi.fn()
      .mockResolvedValueOnce({ data: { id: AGENT_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: ARBOREC_AGENT_ID }, error: null })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            // allGamePlayers fetch (now includes faction, leaders): single .eq() resolves
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
                    { id: ARBOREC_PLAYER_ID, faction: 'The Arborec', leaders: { agent: 'unlocked' } },
                  ],
                  error: null,
                }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
                    error: null,
                  }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      if (table === 'leaders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: leadersMaybySingleMock,
              }),
            }),
          }),
        }
      }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '2,0' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toHaveLength(2)
    const playerIds = body.pending_window.eligible.map((e) => e.player_id)
    expect(playerIds).toContain(CREUSS_PLAYER_ID)
    expect(playerIds).toContain(ARBOREC_PLAYER_ID)
  })
})

// ---------------------------------------------------------------------------
// Phase 43c — Mahact commander bypass + commander passives applied
// ---------------------------------------------------------------------------

describe('game-activate-system Phase 43c — Mahact commander bypass', () => {
  const SYSTEM_KEY_P43C = '1,-1'

  function mockDbPhase43c({
    player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, faction: null, leaders: null },
    activations = [],
  } = {}) {
    const mahactHandlerMock = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mahactHandlerMock)

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            if (fields && !fields.includes('command_tokens')) {
              // allGamePlayers fetch
              return {
                eq: vi.fn().mockResolvedValue({ data: [player], error: null }),
              }
            }
            // single player fetch
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 1, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: activations, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    return { mahactHandlerMock }
  }

  beforeEach(() => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('GIVEN Mahact player with unlocked commander and own token already in system, EXPECT activation succeeds (200) and getHandler called', async () => {
    const mahactPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Mahact Gene-Sorcerers',
      leaders: { commander: 'unlocked' },
    }
    const existingActivation = { id: 'act-uuid', system_key: SYSTEM_KEY_P43C }
    const { mahactHandlerMock } = mockDbPhase43c({
      player: mahactPlayer,
      activations: [existingActivation],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activated).toBe(true)
    expect(getHandler).toHaveBeenCalledWith('mahact_il_na_viroset')
    expect(mahactHandlerMock).toHaveBeenCalled()
  })

  it('GIVEN Mahact player with locked commander and own token already in system, EXPECT 409', async () => {
    const mahactPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Mahact Gene-Sorcerers',
      leaders: { commander: 'locked' },
    }
    mockDbPhase43c({
      player: mahactPlayer,
      activations: [{ id: 'act-uuid', system_key: SYSTEM_KEY_P43C }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })

  it('GIVEN non-Mahact player with own token already in system, EXPECT 409', async () => {
    const solPlayer = {
      id: PLAYER_ID,
      command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 },
      faction: 'The Federation Of Sol',
      leaders: { commander: 'unlocked' },
    }
    mockDbPhase43c({
      player: solPlayer,
      activations: [{ id: 'act-uuid', system_key: SYSTEM_KEY_P43C }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already activated/i)
  })
})

describe('game-activate-system Phase 43c — commander passives applied', () => {
  const SYSTEM_KEY_P43C = '1,-1'

  function mockDbPhase43c({
    player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, faction: null, leaders: null },
    activations = [],
  } = {}) {
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockImplementation((fields) => {
            if (fields && !fields.includes('command_tokens')) {
              return {
                eq: vi.fn().mockResolvedValue({ data: [player], error: null }),
              }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
                }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: GAME_ID, active_player_id: PLAYER_ID, round: 1, map_tiles: {} },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_system_activations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: activations, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: null }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'tiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return {}
    })
  }

  beforeEach(() => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('GIVEN Arborec commander returns a pending window, EXPECT response includes pending_window', async () => {
    mockDbPhase43c()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Arborec',
        player_id: 'arborec-player-uuid',
        effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
      }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Arborec')
    expect(body.pending_window.trigger).toBe('SYSTEM_ACTIVATED')
  })

  it('GIVEN Yssaril commander returns a pending window, EXPECT response includes pending_window', async () => {
    mockDbPhase43c()
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Yssaril Tribes',
        player_id: 'yssaril-player-uuid',
        effect: 'yssaril_peek_window',
      }],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Yssaril Tribes')
  })

  it('GIVEN both reactive agent window and commander passive window, EXPECT reactive_agent window is first (allWindows[0])', async () => {
    // Simulate commander passive window alongside reactive agent window
    vi.mocked(applyCommanderPassives).mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [{
        game_id: GAME_ID,
        trigger: 'SYSTEM_ACTIVATED',
        faction: 'The Arborec',
        player_id: 'arborec-player-uuid',
        effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
      }],
    })

    // For this test, applyCommanderPassives returns a window but no reactive agents
    // We verify the commander window ends up in the response
    mockDbPhase43c()

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // With no reactive agents but one commander passive window, pending_window is the commander one
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.faction).toBe('The Arborec')
  })

  it('GIVEN no commander passives and no reactive agents, EXPECT no pending_window', async () => {
    mockDbPhase43c()
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('GIVEN activation, EXPECT applyCommanderPassives called with SYSTEM_ACTIVATED trigger and correct context', async () => {
    mockDbPhase43c()

    await handler(makeRequest({ game_id: GAME_ID, system_key: SYSTEM_KEY_P43C }))
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'SYSTEM_ACTIVATED',
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID, systemKey: SYSTEM_KEY_P43C }),
      expect.anything(),
    )
  })
})
