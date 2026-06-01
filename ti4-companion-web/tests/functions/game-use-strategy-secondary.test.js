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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-use-strategy-secondary/index.ts'
import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { nullSafeChain } from '../helpers/mockDb.js'
const makeRequest = (body) => _makeRequest('game-use-strategy-secondary', body)

const PLAY_ID = 'play-uuid'
const ABILITY_ID = 'ability-uuid'
const RESPONSE_ID = 'response-uuid'

const DEFAULT_PLAY = { id: PLAY_ID, played_by_player_id: 'other-player', card_number: 8, free_secondary_player_ids: [] }
const DEFAULT_GAME = { id: GAME_ID, round: 1 }

function mockDb({
  player = { id: PLAYER_ID },
  play = DEFAULT_PLAY,
  game = DEFAULT_GAME,
  nextResponse = { id: RESPONSE_ID, player_id: PLAYER_ID },
  abilitySource = { strategy_card_num: 8 },
  updateResponseError = null,
  pendingCount = 0,
  completeError = null,
  mapTiles = {},
  playerFaction = null,
} = {}) {
  let gamePlayersCallCount = 0
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
        }
      }
      // findHomeSystemKey or spendResourcesForSecondaryTech secondary calls
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: playerFaction ? { faction: playerFaction } : null, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: game ? { ...game, map_tiles: mapTiles } : null, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_strategy_card_plays') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: play, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: completeError }),
        }),
      }
    }
    if (table === 'game_strategy_card_responses') {
      return {
        select: vi.fn().mockImplementation((cols, opts) => {
          if (opts?.count === 'exact') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: pendingCount, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: nextResponse, error: null }),
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateResponseError }),
        }),
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: abilitySource, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'planets') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }
    }
    return nullSafeChain()
  })
}

describe('game-use-strategy-secondary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 204 for CORS preflight', async () => {
    const res = await handler(new Request('http://localhost', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when play_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when no active play', async () => {
    mockDb({ play: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when caller is the play owner', async () => {
    mockDb({ play: { ...DEFAULT_PLAY, played_by_player_id: PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when not the next pending responder', async () => {
    mockDb({ nextResponse: { id: RESPONSE_ID, player_id: 'other-player' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 with responded=true and play_complete=false when others still pending', async () => {
    mockDb({ pendingCount: 1 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.responded).toBe(true)
    expect(body.play_complete).toBe(false)
  })

  it('returns 200 with play_complete=true when this was the last pending response', async () => {
    mockDb({ pendingCount: 0 })
    const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.play_complete).toBe(true)
  })

  describe('per-card validation and behavior', () => {
    function playWithCard(n) {
      return { id: PLAY_ID, played_by_player_id: 'other-player', card_number: n, free_secondary_player_ids: [] }
    }
    function sourceForCard(n) {
      return { strategy_card_num: n }
    }

    it('card 1 (Leadership): calls spend_strategy_token and spend_influence_for_tokens when planets provided', async () => {
      mockDb({ play: playWithCard(1), abilitySource: sourceForCard(1) })
      const res = await handler(makeRequest({
        game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID,
        selections: { influence_planet_ids: ['Mecatol Rex'] },
      }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ op: 'spend_strategy_token' }),
          expect.objectContaining({ op: 'spend_influence_for_tokens' }),
        ]),
        expect.anything(), expect.anything()
      )
    })

    it('card 1 (Leadership): calls only spend_strategy_token when no influence planets', async () => {
      mockDb({ play: playWithCard(1), abilitySource: sourceForCard(1) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }],
        expect.anything(), expect.anything()
      )
    })

    it('card 2 (Diplomacy): returns 409 when more than 2 planets_to_ready', async () => {
      mockDb({ play: playWithCard(2), abilitySource: sourceForCard(2) })
      const res = await handler(makeRequest({
        game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID,
        selections: { planets_to_ready: ['p1', 'p2', 'p3'] },
      }))
      expect(res.status).toBe(409)
    })

    it('card 2 (Diplomacy): calls spend_strategy_token and ready_planets', async () => {
      mockDb({ play: playWithCard(2), abilitySource: sourceForCard(2) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ op: 'spend_strategy_token' }),
          expect.objectContaining({ op: 'ready_planets' }),
        ]),
        expect.anything(), expect.anything()
      )
    })

    it('card 3 (Politics): calls spend_strategy_token and two draw_action_card', async () => {
      mockDb({ play: playWithCard(3), abilitySource: sourceForCard(3) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }, { op: 'draw_action_card' }, { op: 'draw_action_card' }],
        expect.anything(), expect.anything()
      )
    })

    it('card 4 (Construction): returns 409 when system_coords missing', async () => {
      mockDb({ play: playWithCard(4), abilitySource: sourceForCard(4) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 4 (Construction): calls spend_strategy_token, inserts activation, places structure', async () => {
      mockDb({ play: playWithCard(4), abilitySource: sourceForCard(4) })
      const res = await handler(makeRequest({
        game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID,
        selections: { system_coords: '0,1', planet_id: 'Mecatol Rex', unit_type: 'space_dock' },
      }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }],
        expect.anything(), expect.anything()
      )
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'place_structure' }],
        expect.objectContaining({ selections: expect.objectContaining({ planet_name: 'Mecatol Rex', structure_type: 'space_dock' }) }),
        expect.anything()
      )
    })

    it('card 5 (Trade): spends token when not in free_secondary_player_ids', async () => {
      mockDb({ play: playWithCard(5), abilitySource: sourceForCard(5) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }], expect.anything(), expect.anything()
      )
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'replenish_commodities', target: 'self' }], expect.anything(), expect.anything()
      )
    })

    it('card 5 (Trade): skips token spend when player is in free_secondary_player_ids', async () => {
      const freePlay = { ...playWithCard(5), free_secondary_player_ids: [PLAYER_ID] }
      mockDb({ play: freePlay, abilitySource: sourceForCard(5) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).not.toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }], expect.anything(), expect.anything()
      )
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'replenish_commodities', target: 'self' }], expect.anything(), expect.anything()
      )
    })

    it('card 6 (Warfare): calls spend_strategy_token and returns home_system_key', async () => {
      mockDb({
        play: playWithCard(6), abilitySource: sourceForCard(6),
        playerFaction: 'Arborec',
        mapTiles: { '1,2': { faction: 'Arborec' } },
      })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('home_system_key', '1,2')
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }], expect.anything(), expect.anything()
      )
    })

    it('card 7 (Technology): returns 409 when tech_id missing', async () => {
      mockDb({ play: playWithCard(7), abilitySource: sourceForCard(7) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(409)
    })

    it('card 7 (Technology): calls spend_strategy_token and gain_technology', async () => {
      mockDb({ play: playWithCard(7), abilitySource: sourceForCard(7) })
      const res = await handler(makeRequest({
        game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID,
        selections: { tech_id: 'Neural Motivator', tech_resource_planet_ids: [], tech_trade_goods: 4 },
      }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }], expect.anything(), expect.anything()
      )
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'gain_technology' }],
        expect.objectContaining({ selections: { technology_name: 'Neural Motivator' } }),
        expect.anything()
      )
    })

    it('card 8 (Imperial): calls spend_strategy_token and draw_secret_objective', async () => {
      mockDb({ play: playWithCard(8), abilitySource: sourceForCard(8) })
      const res = await handler(makeRequest({ game_id: GAME_ID, play_id: PLAY_ID, ability_definition_id: ABILITY_ID }))
      expect(res.status).toBe(200)
      expect(interpretEffects).toHaveBeenCalledWith(
        [{ op: 'spend_strategy_token' }, { op: 'draw_secret_objective' }],
        expect.anything(), expect.anything()
      )
    })
  })
})
