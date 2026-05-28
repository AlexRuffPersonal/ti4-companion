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
  EVT_ROLL_GROUND_COMBAT_DICE: 'roll_ground_combat_dice',
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
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-roll-ground-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_GROUND_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'ground',
  phase: 'attacker_roll',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  system_key: '1,-1',
  planet_name: 'Wellon',
  attacker_hits: 0,
  defender_hits: 0,
}

const BASE_PLAYER = {
  id: ATTACKER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const INFANTRY_UNIT = { id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }

function mockDb({
  player = BASE_PLAYER,
  combat = BASE_GROUND_COMBAT,
  rollerUnits = [INFANTRY_UNIT],
  unitDefs = [INFANTRY_DEF],
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
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
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
                eq: vi.fn().mockResolvedValue({ data: rollerUnits, error: null }),
              }),
            }),
          }),
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
  applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
})

describe('game-roll-ground-combat-dice Phase 43c — commander passives', () => {
  it('calls applyCommanderPassives with COMBAT_ROLL trigger and correct context', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'COMBAT_ROLL',
      expect.objectContaining({
        gameId: GAME_ID,
        activatingPlayerId: ATTACKER_ID,
        systemKey: '1,-1',
      }),
      expect.anything(),
    )
  })

  it('Winnu commander — +2 combat bonus applies to ground combat dice', async () => {
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

    // Math.random → 0.5 → Math.ceil(0.5 * 10) = 5; infantry hit_on=8
    // Without bonus: 5 < 8 → miss. With +2: 7 < 8 → still miss, but roll is increased
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)

    mockDb({ rollerUnits: [INFANTRY_UNIT], unitDefs: [INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice).toBeDefined()
    expect(body.dice.length).toBe(1)
    expect(body.dice[0].roll).toBe(5 + 2) // original 5 + bonus 2 = 7
    expect(body.dice[0].hit_on).toBe(8)
    expect(body.dice[0].hit).toBe(false) // 7 < 8 → miss

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — +2 bonus causes die to hit when it would not otherwise', async () => {
    // Roll of 6 with hit_on=8: without bonus = miss; with +2 = roll 8, hit_on 8 = hit
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

    // Math.random → 0.6 → Math.ceil(0.6 * 10) = 6; 6 < 8 miss; 6+2=8 >= 8 hit
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6)

    mockDb({ rollerUnits: [INFANTRY_UNIT], unitDefs: [INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(8) // 6 + 2
    expect(body.dice[0].hit).toBe(true) // 8 >= 8
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — hits recounted correctly after bonus applied to multiple dice', async () => {
    // Two infantry units, each rolls once. Both get +2.
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

    let callCount = 0
    const mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++
      // First infantry: 0.6 → 6; Second infantry: 0.9 → 9
      return callCount === 1 ? 0.6 : 0.9
    })

    const twoInfantry = [
      { id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' },
      { id: 'u2', player_id: ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' },
    ]
    mockDb({ rollerUnits: twoInfantry, unitDefs: [INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Die 1: 6 + 2 = 8 >= 8 → hit
    // Die 2: 9 + 2 = 11 >= 8 → hit (capped at 10 before, but roll is still 11 in result)
    expect(body.dice.length).toBe(2)
    expect(body.dice[0].roll).toBe(8) // 6 + 2
    expect(body.dice[0].hit).toBe(true)
    expect(body.dice[1].roll).toBe(11) // 9 + 2
    expect(body.dice[1].hit).toBe(true)
    expect(body.hits).toBe(2)

    mathRandomSpy.mockRestore()
  })

  it('no bonus applied when applyCommanderPassives returns no inline effects', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    mockDb({ rollerUnits: [INFANTRY_UNIT], unitDefs: [INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // roll = Math.ceil(0.9 * 10) = 9, no bonus applied
    expect(body.dice[0].roll).toBe(9)
    expect(body.dice[0].hit).toBe(true) // 9 >= 8

    mathRandomSpy.mockRestore()
  })

  it('pending_window included in response when returned by applyCommanderPassives', async () => {
    const jolNarWindow = {
      type: 'commander_reroll',
      player_id: ATTACKER_ID,
      dice: [],
      faction: 'The Universities Of Jol-Nar',
    }
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [jolNarWindow],
    })

    mockDb()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_reroll')
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
  })

  it('pending_window included when pushed by inline handler to context.pendingWindows', async () => {
    const jolNarWindow = {
      type: 'commander_reroll',
      player_id: ATTACKER_ID,
      dice: [],
      faction: 'The Universities Of Jol-Nar',
    }
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [{ faction: 'The Universities Of Jol-Nar', effect: 'jol_nar_reroll_window' }],
      pendingWindows: [],
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

    mockDb()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_reroll')
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
  })

  it('no pending_window in response when applyCommanderPassives returns empty pendingWindows', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    mockDb()

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

    mockDb()

    await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))

    expect(getHandler).toHaveBeenCalledWith('winnu_combat_bonus')
    expect(mockHandlerFn).toHaveBeenCalled()
  })

  it('skips inline effects where effect is not a string, not calling getHandler', async () => {
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [
        { faction: 'Some Faction', effect: [{ op: 'gain_trade_goods', amount: 1 }] },
      ],
      pendingWindows: [],
    })

    mockDb()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(getHandler).not.toHaveBeenCalled()
  })
})
