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

vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([])
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ASSIGN_HITS: 'assign_hits',
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { checkAndEliminate } from '../../../supabase/functions/_shared/eliminationHandler.ts'
import { handler } from '../../../supabase/functions/game-assign-hits/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ATTACKER_ID = 'attacker-uuid'
const DEFENDER_ID = 'defender-uuid'
const TITANS_PLAYER_ID = 'titans-player-uuid'
const COMBAT_ID = 'combat-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-assign-hits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const BASE_COMBAT = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  combat_type: 'space',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'defender_assign',
  round: 1,
  status: 'active',
  attacker_hits: 1,
  defender_hits: 0,
  retreat_declared_by: null,
  retreat_destination: null,
}

// All game players including a Titans player with unlocked agent
const ALL_PLAYERS_WITH_TITANS = [
  { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
  { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
  { id: TITANS_PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } },
]

const ALL_PLAYERS_NO_TITANS = [
  { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
  { id: ATTACKER_ID, faction: 'The Federation Of Sol', leaders: null },
]

/**
 * This mock supports two different game_players query shapes:
 * 1. Player lookup: .select('id').eq('game_id').eq('user_id').maybeSingle()
 * 2. All players: .select('id, faction, leaders').eq('game_id') → resolves array
 */
function mockDb({
  player = { id: DEFENDER_ID },
  combat = BASE_COMBAT,
  unitDefs = [{ name: 'fighter', sustain_damage: true }],
  assigneeUnits = [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
  atkUnitsLeft = [{ id: 'u2' }],
  defUnitsLeft = [{ id: 'u1' }],
  allPlayers = ALL_PLAYERS_WITH_TITANS,
} = {}) {
  let unitQueryCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id, faction, leaders') {
            // allPlayers query: .eq('game_id', ...) → resolves array
            return {
              eq: vi.fn().mockResolvedValue({ data: allPlayers }),
            }
          }
          // Player lookup: .eq('game_id').eq('user_id').maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: player }),
              }),
            }),
          }
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: combat }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
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
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockImplementation((fields) => {
          if (fields === 'id') {
            const isFirstQuery = unitQueryCount === 0
            unitQueryCount++
            const resultData = isFirstQuery ? atkUnitsLeft : defUnitsLeft
            const chainable = {}
            chainable.eq = vi.fn().mockReturnValue(chainable)
            chainable.is = vi.fn().mockResolvedValue({ data: resultData })
            return chainable
          }
          const chainable = {}
          chainable.eq = vi.fn().mockReturnValue(chainable)
          chainable.is = vi.fn().mockResolvedValue({ data: assigneeUnits })
          return chainable
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: null }),
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
            is: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'game_system_tokens') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  checkAndEliminate.mockResolvedValue([])
  requireAuth.mockResolvedValue(USER_ID)
})

describe('reactive agent on sustain damage', () => {
  it('includes pending_windows with reactive_agent for Titans when sustain damage occurs (defender_assign)', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
      unitDefs: [{ name: 'fighter', sustain_damage: true }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
      allPlayers: ALL_PLAYERS_WITH_TITANS,
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_windows).toBeDefined()
    expect(body.pending_windows.length).toBeGreaterThan(0)
    const titansWindow = body.pending_windows.find(w => w.faction === 'The Titans Of Ul')
    expect(titansWindow).toBeDefined()
    expect(titansWindow.type).toBe('reactive_agent')
    expect(titansWindow.player_id).toBe(TITANS_PLAYER_ID)
  })

  it('does not include pending_windows when no sustain damage occurs', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
      unitDefs: [{ name: 'cruiser', sustain_damage: false }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1' }],
      allPlayers: ALL_PLAYERS_WITH_TITANS,
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'cruiser', player_unit_id: 'u1', action: 'destroy' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_windows).toBeUndefined()
  })

  it('does not include Titans in pending_windows when Titans agent is not unlocked', async () => {
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
      unitDefs: [{ name: 'fighter', sustain_damage: true }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
      allPlayers: [
        { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: null },
        { id: TITANS_PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'locked' } },
      ],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_windows).toBeUndefined()
  })

  it('does not include the acting player in reactive agent windows even if eligible', async () => {
    // DEFENDER_ID is acting, assign the Titans faction to them
    mockDb({
      player: { id: DEFENDER_ID },
      combat: { ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1, defender_hits: 0 },
      unitDefs: [{ name: 'fighter', sustain_damage: true }],
      assigneeUnits: [{ id: 'u1', player_id: DEFENDER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1' }],
      allPlayers: [
        // DEFENDER_ID IS The Titans Of Ul with unlocked agent — should be excluded
        { id: DEFENDER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } },
      ],
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'sustain' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_windows).toBeUndefined()
  })

  it('includes GROUND_COMBAT_START reactive agents when body.phase is ground_combat_start', async () => {
    // ATTACKER_ID is acting (attacker_assign), Letnev and Sol agents are unlocked for other players
    const gcPlayers = [
      { id: ATTACKER_ID, faction: 'The Titans Of Ul', leaders: null },
      { id: DEFENDER_ID, faction: 'The Barony Of Letnev', leaders: { agent: 'unlocked' } },
      { id: TITANS_PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'unlocked' } },
    ]
    mockDb({
      player: { id: ATTACKER_ID },
      combat: {
        ...BASE_COMBAT,
        phase: 'attacker_assign',
        attacker_hits: 0,
        defender_hits: 0,
        retreat_declared_by: null,
      },
      unitDefs: [{ name: 'cruiser', sustain_damage: false }],
      assigneeUnits: [],
      atkUnitsLeft: [{ id: 'u1' }],
      defUnitsLeft: [{ id: 'u2' }],
      allPlayers: gcPlayers,
    })
    const res = await handler(makeRequest({
      game_id: GAME_ID, combat_id: COMBAT_ID,
      casualties: [],
      phase: 'ground_combat_start',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_windows).toBeDefined()
    expect(body.pending_windows.length).toBe(2)
    const factions = body.pending_windows.map(w => w.faction)
    expect(factions).toContain('The Barony Of Letnev')
    expect(factions).toContain('The Federation Of Sol')
  })
})
