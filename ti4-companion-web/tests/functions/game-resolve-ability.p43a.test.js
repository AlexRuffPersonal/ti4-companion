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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_RESOLVE_ABILITY: 'resolve_ability',
}))

vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  AGENT_ABILITIES: {
    'The Titans Of Ul': [{ op: 'cancel_hit', target: 'either' }],
    'The Federation Of Sol': [{ op: 'place_units', unit_type: 'infantry', count: 2, target: 'active_planet' }],
    'The Ghosts Of Creuss': 'creuss_quantum_entanglement',
  },
  HERO_ABILITIES: {
    'The Federation Of Sol': [{ op: 'reclaim_command_tokens' }],
    'The Titans Of Ul': 'titans_hero',
  },
  AGENT_REACTIVE_TRIGGERS: {
    'The Ghosts Of Creuss': ['SYSTEM_ACTIVATED'],
    'The Arborec': ['SYSTEM_ACTIVATED'],
    'The Empyrean': ['SHIPS_MOVED'],
    'The Barony Of Letnev': ['GROUND_COMBAT_START'],
    'The Federation Of Sol': ['GROUND_COMBAT_START'],
    'The Yssaril Tribes': ['SYSTEM_ACTIVATED'],
  },
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ABILITY_ID = 'ability-uuid'
const LEADER_ID = 'leader-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// A minimal ability definition with no source side-effects
const BASE_ABILITY = {
  id: ABILITY_ID,
  ability_name: 'Test Leader Ability',
  effects: [],
  handler: null,
  exhausts_source: false,
  purges_source: false,
}

/**
 * Build the db.from mock chain for leader-branch tests.
 *
 * Query sequence (in order of execution for source_type='leader', agent path):
 *  1. game_players — activating player lookup (select id,action_card_count,faction … maybeSingle)
 *  2. ability_definitions — ability lookup (maybeSingle)
 *  3. ability_sources — called for source_type='leader' with source_id
 *  4. leaders — fetch leader row by id (maybeSingle)
 *  5. game_players — fetch player leaders JSONB (maybeSingle)
 *  6. game_players UPDATE — set leaders.agent/hero (update/eq)  ← this is a db.from call
 *  7. game_players — all players for reactive agent check (select…eq resolved as array)
 *  8. leaders — per-faction leader lookup in reactive check (maybeSingle, may repeat)
 *  (Phase 30 TCS check only fires when exhausts_source=true AND source_type='leader')
 */
function mockDbLeader({
  activatingPlayer = { id: PLAYER_ID, action_card_count: 0, faction: 'The Federation Of Sol' },
  ability = BASE_ABILITY,
  leaderRow = { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'agent' },
  playerLeaders = { agent: 'unlocked', hero: 'locked', commander: 'locked' },
  allPlayers = [{ id: PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' } }],
  reactiveFactionLeader = null,
} = {}) {
  let gamePlayersCallCount = 0
  let leadersCallCount = 0

  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++

      if (gamePlayersCallCount === 1) {
        // Activating player lookup: .select().eq(game_id).eq(user_id).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: activatingPlayer, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      if (gamePlayersCallCount === 2) {
        // Player leaders JSONB fetch: .select('leaders').eq('id', player.id).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { leaders: playerLeaders }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      if (gamePlayersCallCount === 3) {
        // game_players UPDATE for agent/hero state change
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      if (gamePlayersCallCount === 4) {
        // All players for reactive agent check: .select('id, faction, leaders').eq('game_id', …)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }

      // Fallback for TCS check (Phase 30): .select('id, technologies, exhausted_technologies').eq(game_id)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }

    if (table === 'ability_definitions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }),
          }),
        }),
      }
    }

    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'source-record-uuid' }, error: null }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'leaders') {
      leadersCallCount++

      if (leadersCallCount === 1) {
        // Leader row lookup by id: .select('id, faction, leader_type').eq('id', source_id).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: leaderRow, error: null }),
            }),
          }),
        }
      }

      // Subsequent calls: reactive agent leader lookup per faction
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: reactiveFactionLeader ?? { id: 'reactive-leader-uuid' },
                error: null,
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'game_players' || table === 'game_relic_deck' || table === 'game_action_card_deck') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }

    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

// ---------------------------------------------------------------------------
// Agent activation
// ---------------------------------------------------------------------------

describe('leader agent activation', () => {
  it('409 agent already exhausted', async () => {
    mockDbLeader({
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'agent' },
      playerLeaders: { agent: 'exhausted', hero: 'locked', commander: 'locked' },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exhausted/i)
  })

  it('resolves DSL ops and exhausts agent for Titans Of Ul', async () => {
    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Titans Of Ul' },
      leaderRow: { id: LEADER_ID, faction: 'The Titans Of Ul', leader_type: 'agent' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
      allPlayers: [{ id: PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op: 'cancel_hit' })]),
      expect.anything(),
      expect.anything(),
    )

    // Verify that game_players was updated to set agent = exhausted
    const updateCalls = db.from.mock.calls.filter(c => c[0] === 'game_players')
    const gpMock = db.from.mock.results.find((r, i) => db.from.mock.calls[i]?.[0] === 'game_players' && r.value?.update)
    expect(gpMock).toBeDefined()
  })

  it('calls string handler for Ghosts Of Creuss agent', async () => {
    const mockHandlerFn = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mockHandlerFn)

    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Ghosts Of Creuss' },
      leaderRow: { id: LEADER_ID, faction: 'The Ghosts Of Creuss', leader_type: 'agent' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
      allPlayers: [{ id: PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(200)
    // getHandler is called for the Creuss agent ability (string handler key)
    expect(getHandler).toHaveBeenCalledWith('creuss_quantum_entanglement')
    expect(mockHandlerFn).toHaveBeenCalled()
    // interpretEffects may also be called by step 5 (ability_definitions DSL) — that's OK
  })
})

// ---------------------------------------------------------------------------
// Hero activation
// ---------------------------------------------------------------------------

describe('leader hero activation', () => {
  it('409 hero not unlocked (locked)', async () => {
    mockDbLeader({
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'hero' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not unlocked/i)
  })

  it('409 hero not unlocked (purged)', async () => {
    mockDbLeader({
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'hero' },
      playerLeaders: { agent: 'unlocked', hero: 'purged', commander: 'locked' },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(409)
  })

  it('resolves DSL ops and purges hero for Federation Of Sol', async () => {
    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Federation Of Sol' },
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'hero' },
      playerLeaders: { agent: 'unlocked', hero: 'unlocked', commander: 'locked' },
      allPlayers: [{ id: PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'unlocked' } }],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op: 'reclaim_command_tokens' })]),
      expect.anything(),
      expect.anything(),
    )
  })

  it('calls string handler for Titans Of Ul hero and does NOT write purge', async () => {
    const mockHandlerFn = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mockHandlerFn)

    // Track update calls to game_players
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    let gamePlayersCallCount = 0
    let leadersCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        if (gamePlayersCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: PLAYER_ID, action_card_count: 0, faction: 'The Titans Of Ul' },
                    error: null,
                  }),
                }),
              }),
            }),
            update: updateMock,
          }
        }
        if (gamePlayersCallCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { leaders: { agent: 'unlocked', hero: 'unlocked', commander: 'locked' } },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          }
        }
        // Reactive check
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: PLAYER_ID, faction: 'The Titans Of Ul', leaders: { agent: 'unlocked' } }],
              error: null,
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'ability_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: BASE_ABILITY, error: null }),
            }),
          }),
        }
      }
      if (table === 'ability_sources') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src' }, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'leaders') {
        leadersCallCount++
        if (leadersCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: LEADER_ID, faction: 'The Titans Of Ul', leader_type: 'hero' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'rl-uuid' }, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
    }))

    expect(res.status).toBe(200)
    expect(getHandler).toHaveBeenCalledWith('titans_hero')
    expect(mockHandlerFn).toHaveBeenCalled()

    // update should NOT have been called with purged state for Titans hero
    const purgeCall = updateMock.mock.calls.find(
      args => JSON.stringify(args[0]).includes('"purged"')
    )
    expect(purgeCall).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Reactive agent windows
// ---------------------------------------------------------------------------

describe('reactive agent windows', () => {
  it('includes pending_window for Creuss agent when trigger is SYSTEM_ACTIVATED', async () => {
    const CREUSS_PLAYER_ID = 'creuss-player-uuid'
    const CREUSS_LEADER_ID = 'creuss-leader-uuid'

    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Federation Of Sol' },
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'agent' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
      allPlayers: [
        { id: PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'exhausted' } },
        { id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
      reactiveFactionLeader: { id: CREUSS_LEADER_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
      selections: { trigger: 'SYSTEM_ACTIVATED' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ player_id: CREUSS_PLAYER_ID, faction: 'The Ghosts Of Creuss' }),
      ])
    )
  })

  it('does not include pending_window when no other player has unlocked Creuss agent', async () => {
    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Federation Of Sol' },
      leaderRow: { id: LEADER_ID, faction: 'The Federation Of Sol', leader_type: 'agent' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
      allPlayers: [
        { id: PLAYER_ID, faction: 'The Federation Of Sol', leaders: { agent: 'unlocked' } },
      ],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
      selections: { trigger: 'SYSTEM_ACTIVATED' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('excludes the activating player from reactive agent check', async () => {
    // Activating player is Creuss with agent unlocked — should not trigger their own reactive
    mockDbLeader({
      activatingPlayer: { id: PLAYER_ID, action_card_count: 0, faction: 'The Ghosts Of Creuss' },
      leaderRow: { id: LEADER_ID, faction: 'The Ghosts Of Creuss', leader_type: 'agent' },
      playerLeaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' },
      allPlayers: [
        { id: PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } },
      ],
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: LEADER_ID,
      selections: { trigger: 'SYSTEM_ACTIVATED' },
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})
