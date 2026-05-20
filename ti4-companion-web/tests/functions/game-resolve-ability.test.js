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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { logEvent } from '../../../supabase/functions/_shared/gameEvents.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ABILITY_ID = 'ability-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
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
