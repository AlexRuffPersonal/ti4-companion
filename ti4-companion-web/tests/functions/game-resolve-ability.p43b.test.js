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
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
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

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
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
  requireAuth.mockResolvedValue({ id: USER_ID })
  getHandler.mockReturnValue(vi.fn().mockResolvedValue(undefined))
})

// ---------------------------------------------------------------------------
// Hero activation — Creuss riftwalker
// ---------------------------------------------------------------------------

describe('hero activation — Creuss riftwalker', () => {
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
          // game_players UPDATE for hero state change (purge write)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            update: updateMock,
          }
        }
        // All players for reactive agent check
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
