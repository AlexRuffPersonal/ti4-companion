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
  getHandler: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
}))

vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_RESOLVE_ABILITY: 'resolve_ability',
}))

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ alliance: [], ceasefire: [], greyfire: [], crucible: [], promiseOfProtection: [], antivirus: [], darkPact: [], tradeConvoys: [] }),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const NOMAD_PLAYER_ID = 'nomad-uuid'
const ABILITY_ID = 'ability-uuid'
const SOURCE_ID = 'agent-source-uuid'
const AGENT_OWNER_ID = 'agent-owner-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

// Ability definition that exhausts a leader source
const EXHAUSTING_LEADER_ABILITY = {
  id: ABILITY_ID,
  exhausts_source: true,
  purges_source: false,
  handler: null,
  effects: [],
}

const NON_EXHAUSTING_ABILITY = {
  id: ABILITY_ID,
  exhausts_source: false,
  purges_source: false,
  handler: null,
  effects: [],
}

function mockDb({
  player = { id: PLAYER_ID, action_card_count: 0 },
  ability = EXHAUSTING_LEADER_ABILITY,
  allPlayers = [],
  leaderRow = { player_id: AGENT_OWNER_ID },
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
            // For allPlayers query: select().eq(game_id)
          }),
        }),
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
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: SOURCE_ID }, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: leaderRow, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

// More specific mock that handles the allPlayers select separately
function mockDbFull({
  player = { id: PLAYER_ID, action_card_count: 0 },
  ability = EXHAUSTING_LEADER_ABILITY,
  allPlayers = [],
  leaderRow = { player_id: AGENT_OWNER_ID },
} = {}) {
  let gamePlayersCallCount = 0
  let leadersCallCount = 0
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      gamePlayersCallCount++
      if (gamePlayersCallCount === 1) {
        // First: activating player lookup (select id,action_card_count, eq game_id, eq user_id, maybeSingle)
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
      } else if (gamePlayersCallCount === 2) {
        // Second: player leaders JSONB fetch from new leader branch
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { leaders: { agent: 'unlocked', hero: 'locked', commander: 'locked' } },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      } else if (gamePlayersCallCount === 3) {
        // Third: game_players UPDATE for agent state (update mock)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      } else {
        // Fourth+: allPlayers lookup for TCS check (select id,technologies,exhausted_technologies, eq game_id)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
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
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: SOURCE_ID }, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'leaders') {
      leadersCallCount++
      if (leadersCallCount === 1) {
        // First: leader reference row lookup by id
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: SOURCE_ID, faction: 'The Nomad', leader_type: 'agent' },
                error: null,
              }),
            }),
          }),
        }
      }
      // Subsequent: reactive agent per-faction lookup
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
    if (table === 'game_leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: leaderRow, error: null }),
          }),
        }),
      }
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-resolve-ability Phase 30 — Temporal Command Suite', () => {
  it('returns pending_window when TCS is unexhausted and another agent is exhausted', async () => {
    const nomadPlayer = {
      id: NOMAD_PLAYER_ID,
      technologies: ['Temporal Command Suite'],
      exhausted_technologies: [],
    }

    mockDbFull({
      player: { id: PLAYER_ID, action_card_count: 0 },
      ability: EXHAUSTING_LEADER_ABILITY,
      allPlayers: [
        { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
        nomadPlayer,
      ],
      leaderRow: { player_id: AGENT_OWNER_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: SOURCE_ID,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolved).toBe(true)
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.type).toBe('agent_exhausted')
    expect(body.pending_window.eligible).toContain(NOMAD_PLAYER_ID)
    expect(body.pending_window.context.exhausted_agent_id).toBe(SOURCE_ID)
    expect(body.pending_window.context.agent_owner_player_id).toBe(AGENT_OWNER_ID)
  })

  it('does not return pending_window when TCS is already exhausted', async () => {
    const nomadPlayer = {
      id: NOMAD_PLAYER_ID,
      technologies: ['Temporal Command Suite'],
      exhausted_technologies: ['Temporal Command Suite'],
    }

    mockDbFull({
      player: { id: PLAYER_ID, action_card_count: 0 },
      ability: EXHAUSTING_LEADER_ABILITY,
      allPlayers: [
        { id: PLAYER_ID, technologies: [], exhausted_technologies: [] },
        nomadPlayer,
      ],
      leaderRow: { player_id: AGENT_OWNER_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: SOURCE_ID,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolved).toBe(true)
    expect(body.pending_window).toBeUndefined()
  })

  it('does not return pending_window when no player has TCS', async () => {
    mockDbFull({
      player: { id: PLAYER_ID, action_card_count: 0 },
      ability: EXHAUSTING_LEADER_ABILITY,
      allPlayers: [
        { id: PLAYER_ID, technologies: ['Neural Motivator'], exhausted_technologies: [] },
      ],
      leaderRow: { player_id: AGENT_OWNER_ID },
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: SOURCE_ID,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })

  it('returns pending_window even when Nomad owns the exhausted agent', async () => {
    // Nomad can use TCS to ready their own agent
    const nomadPlayer = {
      id: NOMAD_PLAYER_ID,
      technologies: ['Temporal Command Suite'],
      exhausted_technologies: [],
    }

    mockDbFull({
      player: { id: NOMAD_PLAYER_ID, action_card_count: 0 },
      ability: EXHAUSTING_LEADER_ABILITY,
      allPlayers: [nomadPlayer],
      leaderRow: { player_id: NOMAD_PLAYER_ID }, // Nomad owns the agent
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'leader',
      source_id: SOURCE_ID,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeDefined()
    expect(body.pending_window.context.agent_owner_player_id).toBe(NOMAD_PLAYER_ID)
  })

  it('does not return pending_window for non-leader source type', async () => {
    const nomadPlayer = {
      id: NOMAD_PLAYER_ID,
      technologies: ['Temporal Command Suite'],
      exhausted_technologies: [],
    }

    // For non-leader source, TCS check should not fire
    // Use a relic source type
    let gamePlayersCallCount = 0
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        gamePlayersCallCount++
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'ability_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: EXHAUSTING_LEADER_ABILITY, error: null }),
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
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: SOURCE_ID }, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'game_relic_deck') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return {}
    })

    const res = await handler(makeRequest({
      game_id: GAME_ID,
      ability_definition_id: ABILITY_ID,
      source_type: 'relic',
      source_id: SOURCE_ID,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
    // game_players should only have been called once (activating player lookup)
    expect(gamePlayersCallCount).toBe(1)
  })
})
