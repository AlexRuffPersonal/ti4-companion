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
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { resolveUnitStats } from '../../../supabase/functions/_shared/techEffects.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-roll-combat-dice/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID, OPPONENT_ID, COMBAT_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'

function makeRequest(body) {
  return _makeRequest('game-roll-combat-dice', body)
}

const CAVALRY_UNIT_ID = 'cavalry-unit-uuid'

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
  cavalry_active_player_id: null,
  cavalry_unit_id: null,
}

const BASE_PLAYER = {
  id: PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const CRUISER_DEF = { name: 'cruiser', combat: '7', afb: null, sustain_damage: false }
const CRUISER_UNIT = { id: 'u1', player_id: PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: '0,0' }
const CAVALRY_CRUISER_UNIT = { id: CAVALRY_UNIT_ID, player_id: PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: '0,0' }

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
    return nullSafeChain()
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
    return nullSafeChain()
  })
}

// Standard mock for p43c tests (no Duranium Armor damaged ships path needed)
function mockDbStandard({ player = BASE_PLAYER, combat = BASE_COMBAT, rollerUnits = [CRUISER_UNIT], unitDefs = [CRUISER_DEF] } = {}) {
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
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: rollerUnits, error: null }),
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
          in: vi.fn().mockResolvedValue({ data: unitDefs, error: null }),
        }),
      }
    }
    return nullSafeChain()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
  applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
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
      return nullSafeChain()
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
      return nullSafeChain()
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
      return nullSafeChain()
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
      return nullSafeChain()
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
      return nullSafeChain()
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const repairUpdate = unitUpdateCaptures.find(u => u.damaged === false)
    expect(repairUpdate).toBeUndefined()
  })

  it('calls logEvent with correct event_type on success', async () => {
    mockDbStandard()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'roll_combat_dice' }))
  })
})

describe('game-roll-combat-dice Phase 43c — commander passives', () => {
  it('calls applyCommanderPassives with COMBAT_ROLL trigger and correct context', async () => {
    mockDbStandard()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'COMBAT_ROLL',
      expect.objectContaining({
        gameId: GAME_ID,
        activatingPlayerId: PLAYER_ID,
        systemKey: '0,0',
      }),
      expect.anything(),
    )
  })

  it('Winnu commander — +2 combat bonus in Mecatol Rex (special system)', async () => {
    // Mock applyCommanderPassives to return an inline Winnu effect
    // and mock getHandler('winnu_combat_bonus') to set combatRollBonus = 2 on context
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Winnu', effect: 'winnu_combat_bonus', condition: 'system is Mecatol Rex' }],
      pendingWindows: [],
    })
    getHandler.mockImplementation((name) => {
      if (name === 'winnu_combat_bonus') {
        return vi.fn().mockImplementation((context) => {
          context.combatRollBonus = 2
          return Promise.resolve()
        })
      }
      return vi.fn().mockResolvedValue(undefined)
    })

    // Use a cruiser with combat 7 — if roll is 5, without bonus it misses; with +2 it becomes 7 (hit)
    // We control Math.random to return 0.4 → Math.ceil(0.4 * 10) = 4
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4)

    mockDbStandard({
      combat: { ...BASE_COMBAT, system_key: '0,0' },
      rollerUnits: [CRUISER_UNIT],
      unitDefs: [CRUISER_DEF], // combat: '7', so hit_on=7
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Without bonus: roll=4, hit_on=7 → miss. With bonus +2: roll=6, still 6 < 7 → miss
    // Let's just verify each die was increased by 2
    expect(body.dice).toBeDefined()
    expect(body.dice.length).toBe(1)
    expect(body.dice[0].roll).toBe(4 + 2) // original roll 4 + bonus 2 = 6
    expect(body.dice[0].hit_on).toBe(7)
    expect(body.dice[0].hit).toBe(false) // 6 < 7 → miss

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — no bonus when applyCommanderPassives returns no inline effects', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    mockDbStandard({
      rollerUnits: [CRUISER_UNIT],
      unitDefs: [CRUISER_DEF],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // roll = Math.ceil(0.9 * 10) = 9, no bonus applied
    expect(body.dice[0].roll).toBe(9)
    expect(body.dice[0].hit).toBe(true) // 9 >= 7

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — +2 bonus causes die to hit when it would not otherwise', async () => {
    // Roll of 5 with hit_on=7: without bonus = miss; with +2 = roll 7, hit_on 7 = hit
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Winnu', effect: 'winnu_combat_bonus' }],
      pendingWindows: [],
    })
    getHandler.mockImplementation((name) => {
      if (name === 'winnu_combat_bonus') {
        return vi.fn().mockImplementation((context) => {
          context.combatRollBonus = 2
          return Promise.resolve()
        })
      }
      return vi.fn().mockResolvedValue(undefined)
    })

    // Math.random → 0.5 → Math.ceil(0.5 * 10) = 5; 5 < 7 normally → miss; 5+2=7 >= 7 → hit
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)

    mockDbStandard({ rollerUnits: [CRUISER_UNIT], unitDefs: [CRUISER_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(7) // 5 + 2
    expect(body.dice[0].hit).toBe(true) // 7 >= 7
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('Jol-Nar commander — pending_window included in response when returned by applyCommanderPassives', async () => {
    const jolNarWindow = {
      type: 'commander_reroll',
      player_id: PLAYER_ID,
      dice: [],
      faction: 'The Universities Of Jol-Nar',
    }
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [jolNarWindow],
    })

    mockDbStandard()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_reroll')
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
  })

  it('Jol-Nar commander — pending_window included when pushed by inline handler to context.pendingWindows', async () => {
    const jolNarWindow = {
      type: 'commander_reroll',
      player_id: PLAYER_ID,
      dice: [],
      faction: 'The Universities Of Jol-Nar',
    }
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Universities Of Jol-Nar', effect: 'jol_nar_reroll_window' }],
      pendingWindows: [], // empty from applyCommanderPassives — comes via inline handler
    })
    getHandler.mockImplementation((name) => {
      if (name === 'jol_nar_reroll_window') {
        return vi.fn().mockImplementation((context) => {
          context.pendingWindows = context.pendingWindows ?? []
          context.pendingWindows.push(jolNarWindow)
          return Promise.resolve()
        })
      }
      return vi.fn().mockResolvedValue(undefined)
    })

    mockDbStandard()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_reroll')
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
  })

  it('no pending_window in response when applyCommanderPassives returns empty pendingWindows', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    mockDbStandard()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeUndefined()
  })

  it('runs getHandler for each string inline effect', async () => {
    const mockHandlerFn = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mockHandlerFn)

    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [
        { faction: 'The Winnu', effect: 'winnu_combat_bonus' },
      ],
      pendingWindows: [],
    })

    mockDbStandard()

    await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))

    expect(getHandler).toHaveBeenCalledWith('winnu_combat_bonus')
    expect(mockHandlerFn).toHaveBeenCalled()
  })

  it('skips inline effects that are Op arrays (non-string), not calling getHandler', async () => {
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [
        { faction: 'Some Faction', effect: [{ op: 'gain_trade_goods', amount: 1 }] },
      ],
      pendingWindows: [],
    })

    mockDbStandard()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    // getHandler should not have been called since effect is not a string
    expect(getHandler).not.toHaveBeenCalled()
  })
})

describe('game-roll-combat-dice Phase 39b — The Cavalry promissory note', () => {
  it('cavalry_active_player_id set for caller and cavalry_unit_id matches a unit → flagship stats applied (combat=5, dice=2)', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: PLAYER_ID,
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDbStandard({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF], // base combat '7', but should be overridden
    })

    // Control Math.random to get deterministic rolls.
    // rollDice() runs first with original cruiser stats (consuming 1 random), then cavalry
    // logic replaces those results and rerolls 2 dice with flagship stats.
    const mathRandomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)  // initial cruiser roll (discarded by cavalry replacement)
      .mockReturnValueOnce(0.29) // first cavalry die: ceil(2.9)=3, miss (3 < 5)
      .mockReturnValueOnce(0.7)  // second cavalry die: ceil(7)=7, hit (7 >= 5)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 2 dice (flagship has 2 dice per unit count=1), rolled with hit_on=5
    expect(body.dice).toHaveLength(2)
    expect(body.dice[0].hit_on).toBe(5)
    expect(body.dice[1].hit_on).toBe(5)
    expect(body.dice[0].roll).toBe(3)
    expect(body.dice[0].hit).toBe(false)
    expect(body.dice[1].roll).toBe(7)
    expect(body.dice[1].hit).toBe(true)
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('cavalry_active_player_id set for opponent (not caller) → no cavalry effect applied', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: OPPONENT_ID, // opponent has cavalry, not caller
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDbStandard({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF], // base combat '7'
    })

    // With no cavalry effect, cruiser has combat=7 and 1 die
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8) // roll=8, hit (8>=7)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 1 die (cruiser base stats), hit_on=7 (not flagship 5)
    expect(body.dice).toHaveLength(1)
    expect(body.dice[0].hit_on).toBe(7)
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('cavalry_active_player_id null → no cavalry effect applied', async () => {
    const combat = {
      ...BASE_COMBAT,
      cavalry_active_player_id: null,
      cavalry_unit_id: CAVALRY_UNIT_ID,
    }
    mockDbStandard({
      combat,
      rollerUnits: [CAVALRY_CRUISER_UNIT],
      unitDefs: [CRUISER_DEF],
    })

    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3) // roll=3, miss (3<7)

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Expect 1 die with hit_on=7 (base cruiser), no cavalry transformation
    expect(body.dice).toHaveLength(1)
    expect(body.dice[0].hit_on).toBe(7)
    expect(body.hits).toBe(0)

    mathRandomSpy.mockRestore()
  })
})
