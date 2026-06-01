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

vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
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
    'The Ghosts Of Creuss': 'creuss_riftwalker',
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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'

const makeRequest = (body) => _makeRequest('game-resolve-ability', body)

const ABILITY_ID = 'ability-uuid'

const DSL_ABILITY = {
  id: ABILITY_ID,
  ability_name: 'Test Ability',
  trigger: { event: 'AGENDA_PHASE_START', owner: 'self' },
  effects: [{ op: 'gain_trade_goods', amount: 1 }],
  handler: null,
  exhausts_source: false,
  purges_source: false,
}

const HANDLER_ABILITY = {
  ...DSL_ABILITY,
  effects: null,
  handler: 'some_handler',
}

function mockDb({ player = { id: PLAYER_ID, action_card_count: 0 }, ability = DSL_ABILITY, source = { id: 'source-uuid' } } = {}) {
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
                maybeSingle: vi.fn().mockResolvedValue({ data: source, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_relic_deck' || table === 'game_action_card_deck') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    return {}
  })
}

describe('game-resolve-ability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when source_type is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when ability not found', async () => {
    mockDb({ ability: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(404)
  })

  it('returns 200 and calls interpretEffects for a DSL ability', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: {} }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledOnce()
    expect(getHandler).not.toHaveBeenCalled()
  })

  it('returns 200 and calls the named handler for a handler ability', async () => {
    mockDb({ ability: HANDLER_ABILITY })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: {} }))
    expect(res.status).toBe(200)
    expect(getHandler).toHaveBeenCalledWith('some_handler')
    expect(interpretEffects).not.toHaveBeenCalled()
  })

  it('marks relic as exhausted when exhausts_source is true', async () => {
    const relicUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'ability_definitions') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, exhausts_source: true }, error: null }) }) }) }
      }
      if (table === 'game_relic_deck') {
        return { update: relicUpdateMock }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src' }, error: null }) }) }) }) }) }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'relic', source_id: 'relic-deck-uuid', selections: {} }))
    expect(res.status).toBe(200)
    expect(relicUpdateMock).toHaveBeenCalledWith({ state: 'exhausted' })
  })

  it('calls logEvent with correct event_type on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(200)
    expect(logEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event_type: 'resolve_ability' }))
  })

  describe('purges_source side-effect for leader', () => {
    const PURGE_LEADER_ABILITY = {
      id: ABILITY_ID,
      ability_name: 'Some Hero',
      trigger: { timing: 'action' },
      effects: [{ op: 'gain_trade_goods', amount: 1 }],
      handler: null,
      exhausts_source: false,
      purges_source: true,
    }
    const LEADER_SOURCE_ID = 'leader-source-uuid'

    it('sets leaders.hero = purged when purges_source=true and source_type=leader', async () => {
      let callCount = 0
      db.from.mockImplementation((table) => {
        if (table === 'game_players') {
          callCount++
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            }
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { leaders: { hero: 'unlocked' } }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        if (table === 'ability_definitions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: PURGE_LEADER_ABILITY, error: null }),
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
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_SOURCE_ID }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'leaders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_SOURCE_ID, faction: 'Test Faction', leader_type: 'hero' }, error: null }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { leaders: { hero: 'unlocked' } }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      })

      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
        source_id: LEADER_SOURCE_ID,
      }))
      expect(res.status).toBe(200)

      // Verify game_players.update was called with leaders.hero = 'purged'
      const updateCalls = db.from.mock.results
        .filter(r => r.value?.update)
        .map(r => r.value.update.mock?.calls?.[0]?.[0])
        .filter(Boolean)
      const purgeCall = updateCalls.find(arg => arg?.leaders?.hero === 'purged')
      expect(purgeCall).toBeDefined()
    })
  })

  describe('ul_progenitor_hero handler', () => {
    const UL_ABILITY = {
      id: ABILITY_ID,
      ability_name: 'Ul The Progenitor',
      trigger: { timing: 'action' },
      effects: null,
      handler: 'ul_progenitor_hero',
      exhausts_source: false,
      purges_source: false,
    }

    it('calls ul_progenitor_hero handler and returns 200', async () => {
      const handlerMock = vi.fn().mockResolvedValue(undefined)
      getHandler.mockReturnValue(handlerMock)
      mockDb({ ability: UL_ABILITY })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
      }))
      expect(res.status).toBe(200)
      expect(handlerMock).toHaveBeenCalledOnce()
    })

    it('returns 409 when handler throws 409 error', async () => {
      const err = Object.assign(new Error('Elysium not controlled'), { status: 409 })
      getHandler.mockReturnValue(vi.fn().mockRejectedValue(err))
      mockDb({ ability: UL_ABILITY })
      const res = await handler(makeRequest({
        game_id: GAME_ID,
        ability_definition_id: ABILITY_ID,
        source_type: 'leader',
      }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toMatch(/Elysium not controlled/)
    })
  })
})

// ---------------------------------------------------------------------------
// Mech abilities
// ---------------------------------------------------------------------------

describe('mech abilities — mech source_type', () => {
  const UNIT_ID = 'unit-uuid'
  const FACTION = 'The Federation of Sol'
  const MECH_EFFECTS = [{ op: 'gain_trade_goods', amount: 1 }]

  const MECH_BODY = {
    game_id: GAME_ID,
    source_type: 'mech',
    source_id: UNIT_ID,
    selections: {},
  }

  function mockMechDb({
    player = { id: PLAYER_ID, action_card_count: 0, faction: FACTION },
    unit = { id: UNIT_ID, unit_type: 'mech', faction: FACTION, effects: MECH_EFFECTS },
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
      if (table === 'units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: unit, error: null }),
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
    mockMechDb()
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when source_id is missing for mech source', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_id/i)
  })

  it('returns 404 when unit not found', async () => {
    mockMechDb({ unit: null })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 409 when unit is not a mech', async () => {
    mockMechDb({ unit: { id: UNIT_ID, unit_type: 'infantry', faction: FACTION, effects: [] } })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not a mech/i)
  })

  it('returns 409 when faction mismatch', async () => {
    mockMechDb({ unit: { id: UNIT_ID, unit_type: 'mech', faction: 'Mentak Coalition', effects: [] } })
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction mismatch/i)
  })

  it('returns 200 and calls interpretEffects with mech effects array', async () => {
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(MECH_EFFECTS, expect.objectContaining({ gameId: GAME_ID }), expect.anything())
    const body = await res.json()
    expect(body.resolved).toBe(true)
  })

  it('propagates 409 when interpretEffects throws a DSL error', async () => {
    const dslError = new Error('Not enough resources')
    dslError.status = 409
    interpretEffects.mockRejectedValueOnce(dslError)
    const res = await handler(makeRequest(MECH_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/not enough resources/i)
  })

  it('does not require ability_definition_id for mech source_type', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID }))
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Phase 30 — Temporal Command Suite
// ---------------------------------------------------------------------------

describe('phase 30 — Temporal Command Suite', () => {
  const NOMAD_PLAYER_ID = 'nomad-uuid'
  const SOURCE_ID = 'agent-source-uuid'
  const AGENT_OWNER_ID = 'agent-owner-uuid'

  const EXHAUSTING_LEADER_ABILITY = {
    id: ABILITY_ID,
    exhausts_source: true,
    purges_source: false,
    handler: null,
    effects: [],
  }

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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        } else {
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
    const nomadPlayer = {
      id: NOMAD_PLAYER_ID,
      technologies: ['Temporal Command Suite'],
      exhausted_technologies: [],
    }

    mockDbFull({
      player: { id: NOMAD_PLAYER_ID, action_card_count: 0 },
      ability: EXHAUSTING_LEADER_ABILITY,
      allPlayers: [nomadPlayer],
      leaderRow: { player_id: NOMAD_PLAYER_ID },
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
    expect(gamePlayersCallCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Phase 39b — promissory note enforcement
// ---------------------------------------------------------------------------

describe('phase 39b — promissory note enforcement', () => {
  const OWNER_ID = 'player-2'
  const TARGET_ID = 'player-3'

  const DSL_ABILITY_39B = {
    id: ABILITY_ID,
    ability_name: 'Test Ability',
    trigger: { timing: 'action' },
    effects: [{ op: 'gain_trade_goods', amount: 1 }],
    handler: null,
    exhausts_source: false,
    purges_source: false,
  }

  function setupDefaultDb(abilityOverrides = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'ability_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY_39B, ...abilityOverrides }, error: null }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    vi.mocked(getActiveNotes).mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
  })

  it('no relevant notes in_play → resolves normally (200)', async () => {
    setupDefaultDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(200)
  })

  it('Promise of Protection in_play: Mentak pillages the holder → 409', async () => {
    setupDefaultDb({ ability_key: 'pillage' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: TARGET_ID }],
      antivirus: [], bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Promise of Protection blocks Pillage/i)
  })

  it('Promise of Protection does NOT block if target is not the holder', async () => {
    setupDefaultDb({ ability_key: 'pillage' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: 'some-other-player' }],
      antivirus: [], bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(200)
  })

  it('Antivirus in_play: Nekro uses Technological Singularity on holder → 409', async () => {
    setupDefaultDb({ ability_key: 'technological_singularity' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [],
      antivirus: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: TARGET_ID }],
      bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Antivirus blocks Technological Singularity/i)
  })

  it('Antivirus does NOT block if target is not the holder', async () => {
    setupDefaultDb({ ability_key: 'technological_singularity' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [], ceasefire: [], greyfire: [], crucible: [],
      promiseOfProtection: [],
      antivirus: [{ ownerPlayerId: PLAYER_ID, holderPlayerId: 'some-other-player' }],
      bloodPact: [], darkPact: [], stymie: [], giftOfPrescience: [], tradeAgreement: [], strikeWingAmbuscade: [],
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: { chosen_player: TARGET_ID } }))
    expect(res.status).toBe(200)
  })

  it('Alliance in_play: holder uses use_commander → resolves (200)', async () => {
    setupDefaultDb({ ability_key: 'use_commander' })
    vi.mocked(getActiveNotes).mockResolvedValue({
      alliance: [{ ownerPlayerId: OWNER_ID, holderPlayerId: PLAYER_ID }],
      supportForThrone: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { faction: 'The Federation Of Sol' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'ability_definitions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY_39B, ability_key: 'use_commander' }, error: null }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Phase 43a — leader agent/hero activation
// ---------------------------------------------------------------------------

describe('phase 43a — leader agent/hero activation', () => {
  const LEADER_ID = 'leader-uuid'

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
   *  1. game_players — activating player lookup
   *  2. ability_definitions — ability lookup
   *  3. ability_sources — called for source_type='leader' with source_id
   *  4. leaders — fetch leader row by id
   *  5. game_players — fetch player leaders JSONB
   *  6. game_players UPDATE — set leaders.agent/hero
   *  7. game_players — all players for reactive agent check
   *  8. leaders — per-faction leader lookup in reactive check
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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }

        if (gamePlayersCallCount === 4) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: allPlayers, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }

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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: leaderRow, error: null }),
              }),
            }),
          }
        }

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

      if (table === 'game_relic_deck' || table === 'game_action_card_deck') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }

      return {}
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  describe('agent activation', () => {
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
      expect(getHandler).toHaveBeenCalledWith('creuss_quantum_entanglement')
      expect(mockHandlerFn).toHaveBeenCalled()
    })
  })

  describe('hero activation', () => {
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

      const purgeCall = updateMock.mock.calls.find(
        args => JSON.stringify(args[0]).includes('"purged"')
      )
      expect(purgeCall).toBeUndefined()
    })
  })

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
})

// ---------------------------------------------------------------------------
// Phase 43b — Creuss riftwalker hero
// ---------------------------------------------------------------------------

describe('phase 43b — hero activation — Creuss riftwalker', () => {
  const LEADER_ID = 'leader-uuid'

  const BASE_ABILITY = {
    id: ABILITY_ID,
    ability_name: 'Test Leader Ability',
    effects: [],
    handler: null,
    exhausts_source: false,
    purges_source: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
    getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
  })

  it('calls creuss_riftwalker string handler and writes purge for Ghosts Of Creuss hero', async () => {
    const mockHeroFn = vi.fn().mockResolvedValue(undefined)
    getHandler.mockReturnValue(mockHeroFn)

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
                    data: { id: PLAYER_ID, action_card_count: 0, faction: 'The Ghosts Of Creuss' },
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
        if (gamePlayersCallCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            update: updateMock,
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: PLAYER_ID, faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } }],
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
                  data: { id: LEADER_ID, faction: 'The Ghosts Of Creuss', leader_type: 'hero' },
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
    expect(getHandler).toHaveBeenCalledWith('creuss_riftwalker')
    expect(mockHeroFn).toHaveBeenCalled()

    // Unlike Titans, Creuss hero SHOULD write purge
    const purgeCall = updateMock.mock.calls.find(
      args => JSON.stringify(args[0]).includes('"purged"')
    )
    expect(purgeCall).toBeDefined()
  })
})
