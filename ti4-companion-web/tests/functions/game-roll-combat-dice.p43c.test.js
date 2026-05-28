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
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
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
    // Jol-Nar's passive trigger in leaderEffects.ts is UNIT_ABILITY_ROLL not COMBAT_ROLL,
    // so it won't fire naturally. Here we test that if applyCommanderPassives does return
    // a pendingWindow, it is included in the response.
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
    // Test the case where an inline handler (like jol_nar_reroll_window) pushes directly to
    // context.pendingWindows, rather than applyCommanderPassives returning it in pendingWindows
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
