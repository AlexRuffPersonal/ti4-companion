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
vi.mock('../../../supabase/functions/_shared/techEffects.ts', () => ({
  resolveUnitStats: vi.fn((unitType, baseStats) => ({ ...baseStats })),
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ROLL_COMBAT_DICE: 'roll_combat_dice',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { resolveUnitStats } from '../../../supabase/functions/_shared/techEffects.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-roll-combat-dice/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OPPONENT_ID = 'opponent-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'space',
  phase: 'attacker_roll',
  attacker_player_id: PLAYER_ID,
  defender_player_id: OPPONENT_ID,
  system_key: '0,0',
  attacker_hits: 0,
  defender_hits: 0,
  pending_effects: {},
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const CRUISER_DEF = { name: 'cruiser', combat: '7', afb: null, sustain_damage: false }
const CRUISER_UNIT = { id: 'u1', player_id: PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: '0,0' }

function mockDb({
  player = BASE_PLAYER,
  combat = BASE_COMBAT,
  rollerUnits = [CRUISER_UNIT],
  unitDefs = [CRUISER_DEF],
  combatUpdateImpl = null,
  unitUpdateImpl = null,
  damagedShips = [],
} = {}) {
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
    if (table === 'game_combats') {
      const updateFn = combatUpdateImpl
        ? vi.fn().mockImplementation(combatUpdateImpl)
        : vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
            }),
          }),
        }),
        update: updateFn,
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: damagedShips, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: unitUpdateImpl
          ? vi.fn().mockImplementation(unitUpdateImpl)
          : vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    return {}
  })
}

// Helper that provides separate mocks for rollerUnits query vs damaged ships query
function mockDbWithSeparateUnits({
  player = BASE_PLAYER,
  combat = BASE_COMBAT,
  rollerUnits = [CRUISER_UNIT],
  unitDefs = [CRUISER_DEF],
  combatUpdateCaptures = [],
  unitUpdateCaptures = [],
  damagedShips = [],
} = {}) {
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
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          combatUpdateCaptures.push(data)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_player_units') {
      // rollerUnits query goes through: eq.eq.eq.is = undefined (no 'damaged' eq)
      // damagedShips query goes through: eq.eq.eq.is.eq.limit
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                // rollerUnits path: .is('on_planet', null) then resolves
                is: vi.fn().mockReturnValue({
                  // damagedShips path: .eq('damaged', true).limit(1)
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: damagedShips, error: null }),
                  }),
                  // rollerUnits plain resolve (no further chain needed)
                }),
              }),
              // rollerUnits for space combat: eq(player_id).is(on_planet).resolves
              is: vi.fn().mockResolvedValue({ data: rollerUnits, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          unitUpdateCaptures.push(data)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
})

describe('game-roll-combat-dice Phase 30', () => {
  it('calls resolveUnitStats with player technologies', async () => {
    const player = { ...BASE_PLAYER, technologies: ['Carrier II'] }
    mockDb({ player, rollerUnits: [CRUISER_UNIT], unitDefs: [CRUISER_DEF] })
    // Override game_player_units to return rollerUnits on the plain is() call
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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        let callCount = 0
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: [CRUISER_UNIT], error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(resolveUnitStats).toHaveBeenCalledWith(
      'cruiser',
      expect.objectContaining({ combat: 7, dice: 1 }),
      ['Carrier II'],
    )
  })

  it('Assault Cannon: updates pending_effects when attacker has 3+ non-fighter ships', async () => {
    const player = { ...BASE_PLAYER, technologies: ['Assault Cannon'] }
    const threeCruisers = [
      { id: 'u1', player_id: PLAYER_ID, unit_type: 'cruiser', count: 2, system_key: '0,0' },
      { id: 'u2', player_id: PLAYER_ID, unit_type: 'destroyer', count: 1, system_key: '0,0' },
    ]
    const combatUpdateCaptures = []

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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            combatUpdateCaptures.push(data)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: threeCruisers, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF, { name: 'destroyer', combat: '9', afb: '9(x2)', sustain_damage: false }], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const assaultCannonUpdate = combatUpdateCaptures.find(u => u.pending_effects?.assault_cannon)
    expect(assaultCannonUpdate).toBeDefined()
    expect(assaultCannonUpdate.pending_effects.assault_cannon).toMatchObject({
      must_destroy: 1,
      non_fighter_only: true,
      eligible: [OPPONENT_ID],
    })
  })

  it('Assault Cannon: no pending_effects update when attacker has <3 non-fighter ships', async () => {
    const player = { ...BASE_PLAYER, technologies: ['Assault Cannon'] }
    const twoCruisers = [
      { id: 'u1', player_id: PLAYER_ID, unit_type: 'cruiser', count: 2, system_key: '0,0' },
    ]
    const combatUpdateCaptures = []

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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            combatUpdateCaptures.push(data)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: twoCruisers, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const assaultCannonUpdate = combatUpdateCaptures.find(u => u.pending_effects?.assault_cannon)
    expect(assaultCannonUpdate).toBeUndefined()
  })

  it('Duranium Armor: repairs one damaged ship when a damaged ship exists', async () => {
    const player = { ...BASE_PLAYER, technologies: ['Duranium Armor'] }
    const damagedShip = { id: 'damaged-ship-uuid' }
    const unitUpdateCaptures = []

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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [damagedShip], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            unitUpdateCaptures.push(data)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    // Need rollerUnits query: game_player_units select chain for main roll
    // Override to provide both paths
    let gpuSelectCount = 0
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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        gpuSelectCount++
        if (gpuSelectCount === 1) {
          // First call: rollerUnits query (eq.eq.eq.is resolves directly)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [CRUISER_UNIT], error: null }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              unitUpdateCaptures.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        } else {
          // Second call: Duranium Armor damaged ships query
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({ data: [damagedShip], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              unitUpdateCaptures.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const repairUpdate = unitUpdateCaptures.find(u => u.damaged === false)
    expect(repairUpdate).toBeDefined()
  })

  it('Duranium Armor: no repair update when no damaged ships exist', async () => {
    const player = { ...BASE_PLAYER, technologies: ['Duranium Armor'] }
    const unitUpdateCaptures = []
    let gpuSelectCount = 0

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
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        gpuSelectCount++
        if (gpuSelectCount === 1) {
          // rollerUnits query
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockResolvedValue({ data: [CRUISER_UNIT], error: null }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              unitUpdateCaptures.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        } else {
          // Duranium Armor query — no damaged ships
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              unitUpdateCaptures.push(data)
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [CRUISER_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const repairUpdate = unitUpdateCaptures.find(u => u.damaged === false)
    expect(repairUpdate).toBeUndefined()
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'roll_combat_dice' }))
  })
})
