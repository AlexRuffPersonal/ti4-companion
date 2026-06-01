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
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const HOLDER_ID = 'holder-player-uuid'
const SARDAKK_ID = 'sardakk-player-uuid'
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
  attacker_player_id: HOLDER_ID,
  defender_player_id: SARDAKK_ID,
  system_key: '1,-1',
  planet_name: 'Wellon',
  attacker_hits: 0,
  defender_hits: 0,
  tekklar_holder_player_id: null,
}

// infantry: combat '8' → hit on 8+; 1 infantry
const INFANTRY_DEF = { name: 'infantry', combat: '8', sustain_damage: false }
const INFANTRY_UNIT = { id: 'u1', player_id: HOLDER_ID, unit_type: 'infantry', count: 1, system_key: '1,-1' }

function mockDb({
  player = { id: HOLDER_ID, technologies: [], exhausted_technologies: [] },
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

describe('game-roll-ground-combat-dice Phase 39b — Tekklar Legion', () => {
  let mathRandomSpy

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
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
    const rollSequence = [0.3, 0.7, 0.9] // ceil(0.3*10)=3, ceil(0.7*10)=7, ceil(0.9*10)=9
    let callIdx = 0
    mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rollSequence[callIdx++ % rollSequence.length])

    mockDb({
      player: { id: HOLDER_ID, technologies: [], exhausted_technologies: [] },
      combat: { ...BASE_GROUND_COMBAT, tekklar_holder_player_id: HOLDER_ID },
      rollerUnits: [
        { id: 'u1', player_id: HOLDER_ID, unit_type: 'infantry', count: 3, system_key: '1,-1' },
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
    const rollSequence = [0.3, 0.7, 0.1] // ceil(0.3*10)=3, ceil(0.7*10)=7, ceil(0.1*10)=1
    let callIdx = 0
    mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => rollSequence[callIdx++ % rollSequence.length])

    // Sardakk is the defender; tekklar holder is someone else (HOLDER_ID)
    mockDb({
      player: { id: SARDAKK_ID, technologies: [], exhausted_technologies: [] },
      combat: {
        ...BASE_GROUND_COMBAT,
        phase: 'defender_roll',
        attacker_player_id: HOLDER_ID,
        defender_player_id: SARDAKK_ID,
        tekklar_holder_player_id: HOLDER_ID,
      },
      rollerUnits: [
        { id: 'u2', player_id: SARDAKK_ID, unit_type: 'infantry', count: 3, system_key: '1,-1' },
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
    // None hit (all < 8)
    expect(body.hits).toBe(0)
  })

  it('tekklar_holder_player_id null → no modification to dice results', async () => {
    // raw roll: 9 → hit on 8 → hit; no tekklar adjustment
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9) // ceil(0.9*10)=9

    mockDb({
      player: { id: HOLDER_ID, technologies: [], exhausted_technologies: [] },
      combat: { ...BASE_GROUND_COMBAT, tekklar_holder_player_id: null },
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.dice[0].roll).toBe(9)
    expect(body.hits).toBe(1)
  })
})
