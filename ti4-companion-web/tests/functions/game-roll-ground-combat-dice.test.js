import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  EVT_ROLL_GROUND_COMBAT_DICE: 'roll_ground_combat_dice',
}))

vi.mock('../../../supabase/functions/_shared/techEffects.ts', () => ({
  resolveUnitStats: vi.fn((unitType, baseStats) => ({ ...baseStats })),
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  applyCommanderPassives: vi.fn().mockResolvedValue({ inlineEffects: [], pendingWindows: [] }),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { resolveUnitStats } from '../../../supabase/functions/_shared/techEffects.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, nullSafeChain } from '../helpers/mockDb.js'

function makeRequest(body) {
  return _makeRequest('game-roll-ground-combat-dice', body)
}

const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const COMBAT_ID = 'combat-uuid'

const BASE_GROUND_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  combat_type: 'ground',
  planet_name: 'Wellon',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'attacker_roll',
  round: 1,
  status: 'active',
  tekklar_holder_player_id: null,
}

function mockDb({
  player = { id: ATTACKER_ID },
  playerError = null,
  combat = BASE_GROUND_COMBAT,
  combatError = null,
  units = [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 2, system_key: '1,-1' }],
  unitDefs = [{ name: 'infantry', combat: '8', sustain_damage: false }],
  updateError = null,
} = {}) {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: combatError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: units }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: unitDefs }),
        }),
      }
    }
    return nullSafeChain()
  })
}

describe('game-roll-ground-combat-dice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
    resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest({ combat_id: COMBAT_ID }))
    expect(res.status).toBe(400)
  })

  it('400 missing combat_id', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('404 combat not found', async () => {
    mockDb({ combat: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(404)
  })

  it('409 combat_type is space', async () => {
    mockDb({ combat: { ...BASE_GROUND_COMBAT, combat_type: 'space' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/ground/i)
  })

  it('409 phase is space_cannon', async () => {
    mockDb({ combat: { ...BASE_GROUND_COMBAT, phase: 'space_cannon' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('409 attacker rolls on defender_roll phase', async () => {
    mockDb({
      player: { id: ATTACKER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'defender_roll' },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('409 defender rolls on attacker_roll phase', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'attacker_roll' },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(409)
  })

  it('attacker_roll: queries units on planet and updates combat to defender_assign', async () => {
    mockDb({ player: { id: ATTACKER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('defender_assign')
    expect(body.dice).toBeDefined()
    expect(typeof body.hits).toBe('number')
  })

  it('defender_roll: updates combat to attacker_assign', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_GROUND_COMBAT, phase: 'defender_roll' },
      units: [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('attacker_assign')
  })
})

// ── Phase 30 — tech effects (resolveUnitStats, Magen Defense Grid, Supercharge, Valkyrie) ─────

const P30_PLAYER_ID = 'player-uuid'
const P30_OPPONENT_ID = 'opponent-uuid'

const P30_BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'ground',
  phase: 'attacker_roll',
  attacker_player_id: P30_PLAYER_ID,
  defender_player_id: P30_OPPONENT_ID,
  system_key: '0,0',
  planet_name: 'Mecatol Rex',
  attacker_hits: 0,
  defender_hits: 0,
}

const P30_BASE_PLAYER = {
  id: P30_PLAYER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const P30_INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const P30_INFANTRY_UNIT = { id: 'u1', player_id: P30_PLAYER_ID, unit_type: 'infantry', count: 1, system_key: '0,0' }

function mockDbP30({
  player = P30_BASE_PLAYER,
  combat = P30_BASE_COMBAT,
  rollerUnits = [P30_INFANTRY_UNIT],
  unitDefs = [P30_INFANTRY_DEF],
  updateCombatError = null,
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateCombatError }),
        }),
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

function makeRequestP30(body) {
  return new Request('http://localhost/game-roll-ground-combat-dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

describe('game-roll-ground-combat-dice Phase 30', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbP30()
    requireAuth.mockResolvedValue(USER_ID)
    resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
  })

  it('calls resolveUnitStats with player technologies', async () => {
    mockDbP30({ player: { ...P30_BASE_PLAYER, technologies: ['Infantry II'] } })
    await handler(makeRequestP30({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(resolveUnitStats).toHaveBeenCalledWith(
      'infantry',
      expect.objectContaining({ combat: 8, dice: 1 }),
      ['Infantry II'],
    )
  })

  it('Magen Defense Grid: attacker rolls produce 0 hits when defender uses it', async () => {
    const defenderPlayer = {
      id: P30_OPPONENT_ID,
      technologies: ['Magen Defense Grid'],
      exhausted_technologies: [],
    }
    let combatUpdateCapture = null
    let playerUpdateCapture = null
    let callCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: P30_BASE_PLAYER, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: defenderPlayer, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((data) => {
              playerUpdateCapture = data
              return { eq: vi.fn().mockResolvedValue({ error: null }) }
            }),
          }
        }
      }
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: P30_BASE_COMBAT, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            combatUpdateCapture = data
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
                  eq: vi.fn().mockResolvedValue({ data: [P30_INFANTRY_UNIT], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ name: 'infantry', planetary_shield: true }], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequestP30({ game_id: GAME_ID, combat_id: COMBAT_ID, selections: { use_magen: true } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hits).toBe(0)
    expect(body.dice).toEqual([])
    expect(body.magen_applied).toBe(true)
    expect(playerUpdateCapture?.exhausted_technologies).toContain('Magen Defense Grid')
    expect(combatUpdateCapture?.attacker_hits).toBe(0)
  })

  it('Supercharge: +1 to all rolls and exhausts tech', async () => {
    let playerUpdateCapture = null
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const lowThresholdDef = { name: 'infantry', combat: '6', sustain_damage: false }
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...P30_BASE_PLAYER, technologies: ['Supercharge'], exhausted_technologies: [] },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((data) => {
            playerUpdateCapture = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_combats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: P30_BASE_COMBAT, error: null }),
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
                  eq: vi.fn().mockResolvedValue({ data: [P30_INFANTRY_UNIT], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [lowThresholdDef], error: null }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequestP30({ game_id: GAME_ID, combat_id: COMBAT_ID, selections: { use_supercharge: true } }))
    expect(res.status).toBe(200)
    const resBody = await res.json()
    // roll=5 → with Supercharge: 5+1=6 ≥ 6 → hit
    expect(resBody.hits).toBe(1)
    expect(resBody.dice[0].roll).toBe(6)
    expect(playerUpdateCapture?.exhausted_technologies).toContain('Supercharge')
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('Valkyrie Particle Weave: +1 hit when opponent had hits', async () => {
    const combatWithOpponentHits = {
      ...P30_BASE_COMBAT,
      phase: 'defender_roll',
      attacker_hits: 2,
    }

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: P30_OPPONENT_ID, technologies: ['Valkyrie Particle Weave'], exhausted_technologies: [] },
                  error: null,
                }),
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
                maybeSingle: vi.fn().mockResolvedValue({ data: combatWithOpponentHits, error: null }),
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
                  eq: vi.fn().mockResolvedValue({ data: [{ ...P30_INFANTRY_UNIT, player_id: P30_OPPONENT_ID }], error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [P30_INFANTRY_DEF], error: null }),
          }),
        }
      }
      return {}
    })

    requireAuth.mockResolvedValue('defender-user')
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // roll=1, no hits from dice
    const res = await handler(makeRequestP30({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const resBody = await res.json()
    // 0 dice hits + 1 from Valkyrie = 1
    expect(resBody.hits).toBe(1)
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('no tech effects when player has no techs', async () => {
    const res = await handler(makeRequestP30({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
  })
})

// ── Phase 39b — Tekklar Legion ────────────────────────────────────────────────────────────────

const P39B_HOLDER_ID = 'holder-player-uuid'
const P39B_SARDAKK_ID = 'sardakk-player-uuid'

const P39B_BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'ground',
  phase: 'attacker_roll',
  attacker_player_id: P39B_HOLDER_ID,
  defender_player_id: P39B_SARDAKK_ID,
  system_key: '1,-1',
  planet_name: 'Wellon',
  attacker_hits: 0,
  defender_hits: 0,
  tekklar_holder_player_id: null,
}

const P39B_INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const P39B_INFANTRY_UNIT = { id: 'u1', player_id: P39B_HOLDER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }

function mockDbP39B({
  player = { id: P39B_HOLDER_ID, technologies: [], exhausted_technologies: [] },
  combat = P39B_BASE_COMBAT,
  rollerUnits = [P39B_INFANTRY_UNIT],
  unitDefs = [P39B_INFANTRY_DEF],
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

describe('game-roll-ground-combat-dice Phase 39b — Tekklar Legion', () => {
  let mathRandomSpy

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  afterEach(() => {
    if (mathRandomSpy) {
      mathRandomSpy.mockRestore()
      mathRandomSpy = null
    }
  })

  it('tekklar_holder_player_id set, caller is holder → each die +1 (capped at 10)', async () => {
    // 3 infantry units to get 3 dice; raw rolls: 3, 7, 9
    // After +1: 4, 8, 10 — infantry hits on 8, so hits = 2
    const rollSequence = [0.3, 0.7, 0.9]
    let callIdx = 0
    mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rollSequence[callIdx++ % rollSequence.length])

    mockDbP39B({
      player: { id: P39B_HOLDER_ID, technologies: [], exhausted_technologies: [] },
      combat: { ...P39B_BASE_COMBAT, tekklar_holder_player_id: P39B_HOLDER_ID },
      rollerUnits: [
        { id: 'u1', player_id: P39B_HOLDER_ID, unit_type: 'infantry', count: 3, system_key: '1,-1' },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Rolls before adjustment: 3, 7, 9; after +1: 4, 8, 10
    expect(body.dice).toHaveLength(3)
    expect(body.dice[0].roll).toBe(4)
    expect(body.dice[1].roll).toBe(8)
    expect(body.dice[2].roll).toBe(10)
    // infantry hits on 8: rolls 4 (miss), 8 (hit), 10 (hit) → 2 hits
    expect(body.hits).toBe(2)
  })

  it('tekklar_holder_player_id set, caller is Sardakk (owner) → each die −1 (floor at 1)', async () => {
    // 3 infantry; raw rolls: 3, 7, 1
    // After -1: 2, 6, 1 (floor at 1) — infantry hits on 8, so hits = 0
    const rollSequence = [0.3, 0.7, 0.1]
    let callIdx = 0
    mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rollSequence[callIdx++ % rollSequence.length])

    mockDbP39B({
      player: { id: P39B_SARDAKK_ID, technologies: [], exhausted_technologies: [] },
      combat: {
        ...P39B_BASE_COMBAT,
        phase: 'defender_roll',
        attacker_player_id: P39B_HOLDER_ID,
        defender_player_id: P39B_SARDAKK_ID,
        tekklar_holder_player_id: P39B_HOLDER_ID,
      },
      rollerUnits: [
        { id: 'u2', player_id: P39B_SARDAKK_ID, unit_type: 'infantry', count: 3, system_key: '1,-1' },
      ],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Rolls before adjustment: 3, 7, 1; after -1: 2, 6, 1
    expect(body.dice).toHaveLength(3)
    expect(body.dice[0].roll).toBe(2)
    expect(body.dice[1].roll).toBe(6)
    expect(body.dice[2].roll).toBe(1)
    expect(body.hits).toBe(0)
  })

  it('tekklar_holder_player_id null → no modification to dice results', async () => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    mockDbP39B({
      player: { id: P39B_HOLDER_ID, technologies: [], exhausted_technologies: [] },
      combat: { ...P39B_BASE_COMBAT, tekklar_holder_player_id: null },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(9)
    expect(body.hits).toBe(1)
  })
})

// ── Phase 43c — commander passives ───────────────────────────────────────────────────────────

const P43C_ATTACKER_ID = 'attacker-uuid'
const P43C_DEFENDER_ID = 'defender-uuid'

const P43C_BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  combat_type: 'ground',
  phase: 'attacker_roll',
  attacker_player_id: P43C_ATTACKER_ID,
  defender_player_id: P43C_DEFENDER_ID,
  system_key: '1,-1',
  planet_name: 'Wellon',
  attacker_hits: 0,
  defender_hits: 0,
}

const P43C_BASE_PLAYER = {
  id: P43C_ATTACKER_ID,
  technologies: [],
  exhausted_technologies: [],
}

const P43C_INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const P43C_INFANTRY_UNIT = { id: 'u1', player_id: P43C_ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }

function mockDbP43C({
  player = P43C_BASE_PLAYER,
  combat = P43C_BASE_COMBAT,
  rollerUnits = [P43C_INFANTRY_UNIT],
  unitDefs = [P43C_INFANTRY_DEF],
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

describe('game-roll-ground-combat-dice Phase 43c — commander passives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    resolveUnitStats.mockImplementation((unitType, baseStats) => ({ ...baseStats }))
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls applyCommanderPassives with COMBAT_ROLL trigger and correct context', async () => {
    mockDbP43C()
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(applyCommanderPassives).toHaveBeenCalledWith(
      'COMBAT_ROLL',
      expect.objectContaining({
        gameId: GAME_ID,
        activatingPlayerId: P43C_ATTACKER_ID,
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

    mockDbP43C({ rollerUnits: [P43C_INFANTRY_UNIT], unitDefs: [P43C_INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice).toBeDefined()
    expect(body.dice.length).toBe(1)
    expect(body.dice[0].roll).toBe(5 + 2)
    expect(body.dice[0].hit_on).toBe(8)
    expect(body.dice[0].hit).toBe(false)

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — +2 bonus causes die to hit when it would not otherwise', async () => {
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

    mockDbP43C({ rollerUnits: [P43C_INFANTRY_UNIT], unitDefs: [P43C_INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(8) // 6 + 2
    expect(body.dice[0].hit).toBe(true) // 8 >= 8
    expect(body.hits).toBe(1)

    mathRandomSpy.mockRestore()
  })

  it('Winnu commander — hits recounted correctly after bonus applied to multiple dice', async () => {
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
      return callCount === 1 ? 0.6 : 0.9
    })

    const twoInfantry = [
      { id: 'u1', player_id: P43C_ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' },
      { id: 'u2', player_id: P43C_ATTACKER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' },
    ]
    mockDbP43C({ rollerUnits: twoInfantry, unitDefs: [P43C_INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    // Die 1: 6 + 2 = 8 >= 8 → hit
    // Die 2: 9 + 2 = 11 >= 8 → hit
    expect(body.dice.length).toBe(2)
    expect(body.dice[0].roll).toBe(8)
    expect(body.dice[0].hit).toBe(true)
    expect(body.dice[1].roll).toBe(11)
    expect(body.dice[1].hit).toBe(true)
    expect(body.hits).toBe(2)

    mathRandomSpy.mockRestore()
  })

  it('no bonus applied when applyCommanderPassives returns no inline effects', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    mockDbP43C({ rollerUnits: [P43C_INFANTRY_UNIT], unitDefs: [P43C_INFANTRY_DEF] })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(9)
    expect(body.dice[0].hit).toBe(true) // 9 >= 8

    mathRandomSpy.mockRestore()
  })

  it('pending_window included in response when returned by applyCommanderPassives', async () => {
    const jolNarWindow = {
      type: 'commander_reroll',
      player_id: P43C_ATTACKER_ID,
      dice: [],
      faction: 'The Universities Of Jol-Nar',
    }
    applyCommanderPassives.mockResolvedValue({
      inlineEffects: [],
      pendingWindows: [jolNarWindow],
    })

    mockDbP43C()

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
      player_id: P43C_ATTACKER_ID,
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

    mockDbP43C()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('commander_reroll')
    expect(body.pending_window.faction).toBe('The Universities Of Jol-Nar')
  })

  it('no pending_window in response when applyCommanderPassives returns empty pendingWindows', async () => {
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })

    mockDbP43C()

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

    mockDbP43C()

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

    mockDbP43C()

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    expect(getHandler).not.toHaveBeenCalled()
  })
})
