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
  EVT_FIRE_SPACE_CANNON: 'fire_space_cannon',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const TARGET_ID = 'target-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-fire-space-cannon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  phase: 'space_cannon',
  attacker_player_id: PLAYER_ID,
  defender_player_id: TARGET_ID,
  system_key: '0,0',
  space_cannon_pending: [
    { player_id: PLAYER_ID, system_key: '0,0', unit_type: 'pds', dice_count: 1, resolved: false },
  ],
}

function buildPlayersMock(callerPlayer, targetPlayer, captureUpdate = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        // Second .eq() discriminates by column name
        eq: vi.fn().mockImplementation((col) => {
          if (col === 'user_id') {
            return { maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }) }
          }
          // col === 'id' → target player lookup
          return { maybeSingle: vi.fn().mockResolvedValue({ data: targetPlayer, error: null }) }
        }),
      }),
    }),
    update: vi.fn().mockImplementation((data) => {
      if (captureUpdate) captureUpdate(data)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
}

function buildUnitsMock(spaceCannonStat = '6') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { space_cannon: spaceCannonStat }, error: null }),
      }),
    }),
  }
}

function buildCombatsMock(combat = BASE_COMBAT, captureUpdate = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
        }),
      }),
    }),
    update: vi.fn().mockImplementation((data) => {
      if (captureUpdate) captureUpdate(data)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
}

// game_player_units mock — returns empty arrays (no units to destroy, no destroyers)
function buildUnitRowsMock() {
  const emptyResult = { data: [], error: null }
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue(emptyResult),
          }),
          is: vi.fn().mockResolvedValue(emptyResult),
        }),
        is: vi.fn().mockResolvedValue(emptyResult),
      }),
    }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  }
}

function mockDb({
  callerPlayer = { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
  targetPlayer = { id: TARGET_ID, technologies: [] },
  spaceCannonStat = '6',
  playerUpdateCapture = null,
  combatUpdateCapture = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') return buildPlayersMock(callerPlayer, targetPlayer, playerUpdateCapture)
    if (table === 'game_combats') return buildCombatsMock(BASE_COMBAT, combatUpdateCapture)
    if (table === 'game_player_units') return buildUnitRowsMock()
    if (table === 'units') return buildUnitsMock(spaceCannonStat)
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-fire-space-cannon Phase 30', () => {
  it('Plasma Scoring adds extra die — two dice rolled', async () => {
    mockDb({ callerPlayer: { id: PLAYER_ID, technologies: ['Plasma Scoring'], exhausted_technologies: [] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.0) // roll=1, miss
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false,
      selections: { use_plasma_scoring: true },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dice).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('Graviton Laser exhausted and graviton_active: true returned', async () => {
    let capturedPlayerUpdate = null
    let capturedCombatUpdate = null
    mockDb({
      callerPlayer: { id: PLAYER_ID, technologies: ['Graviton Laser System'], exhausted_technologies: [] },
      playerUpdateCapture: (d) => { capturedPlayerUpdate = d },
      combatUpdateCapture: (d) => { capturedCombatUpdate = d },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false,
      selections: { use_graviton: true },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.graviton_active).toBe(true)
    expect(capturedPlayerUpdate?.exhausted_technologies).toContain('Graviton Laser System')
  })

  it('Antimass Deflectors: -1 to each die result — hit becomes miss', async () => {
    // PDS at '6'. Random=0.5 → floor(0.5*10)+1=6. Normally hits (6>=6).
    // With Antimass: 6-1=5, 5<6 → miss.
    mockDb({ targetPlayer: { id: TARGET_ID, technologies: ['Antimass Deflectors'] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hits).toBe(0)
    expect(body.dice[0].roll).toBe(5)
    vi.restoreAllMocks()
  })

  it('Antimass Deflectors: roll minimum clamped to 1', async () => {
    mockDb({ targetPlayer: { id: TARGET_ID, technologies: ['Antimass Deflectors'] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.0) // floor(0*10)+1=1; 1-1=0 → clamped to 1
    const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, pass: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dice[0].roll).toBe(1)
    vi.restoreAllMocks()
  })

  it('L4 Disruptors: returns 409 during invasion', async () => {
    mockDb({ targetPlayer: { id: TARGET_ID, technologies: ['L4 Disruptors'] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false, is_invasion: true,
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/letnev/i)
  })

  it('L4 Disruptors: does not block when not invasion', async () => {
    mockDb({ targetPlayer: { id: TARGET_ID, technologies: ['L4 Disruptors'] } })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID, pass: false, is_invasion: false,
    }))
    expect(res.status).toBe(200)
  })
})
