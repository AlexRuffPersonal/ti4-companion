import { describe, it, expect, vi, beforeEach } from 'vitest'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

// Mock modules before importing
vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError {
    constructor(msg) { this.message = msg }
  }
  return { requireAuth: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

vi.mock('../../../supabase/functions/_shared/errors.ts', () => ({
  okResponse: vi.fn((data) => ({ ok: true, data })),
  errorResponse: vi.fn((msg, status) => ({ ok: false, status, message: msg })),
  corsPreflightResponse: vi.fn(() => ({})),
}))

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn(),
}))

// Mock relicEffects so we can spy on applyOnGainRelicEffect
vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn(),
}))

// Mock EXPLORATION_EFFECTS
vi.mock('../../../supabase/functions/_shared/explorationEffects.ts', () => ({
  EXPLORATION_EFFECTS: {
    'Test Card': [{ op: 'gain_relic', relic_name: 'The Obsidian' }],
  },
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'
import { handler } from '../../../supabase/functions/game-resolve-exploration-card/index.ts'

const requireAuthMock = vi.mocked(requireAuth)
const dbMock = vi.mocked(db)
const applyAbilityMock = vi.mocked(applyAbility)
const applyOnGainRelicEffectMock = vi.mocked(applyOnGainRelicEffect)

describe('game-resolve-exploration-card (handler integration): gain_relic effect wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls applyOnGainRelicEffect when resolveContext.gainedRelicName is populated after gain_relic card', async () => {
    requireAuthMock.mockResolvedValue(PLAYER_ID)

    // Mock applyAbility to set gainedRelicName on the context it receives
    applyAbilityMock.mockImplementation((ops, context, dbClient) => {
      context.gainedRelicName = 'The Obsidian'
      return Promise.resolve()
    })

    // Mock the handler's db calls
    dbMock.from = vi.fn().mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: PLAYER_ID },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { phase: 'agenda', map_tiles: [] },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'card-1',
                    game_id: GAME_ID,
                    deck_type: 'hazards',
                    state: 'drawn',
                    deck_position: null,
                    name: 'Test Card',
                    text: null,
                    has_attachment: false,
                    relic_fragment_type: null,
                    resolved_by_player_id: PLAYER_ID,
                    planet_name: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    })

    const req = {
      method: 'POST',
      json: vi.fn().mockResolvedValue({
        game_id: GAME_ID,
        player_id: PLAYER_ID,
        card_id: 'card-1',
      }),
    }

    await handler(req)

    // Verify applyOnGainRelicEffect was called with the relic name from the context
    expect(applyOnGainRelicEffectMock).toHaveBeenCalledWith(
      'The Obsidian',
      GAME_ID,
      PLAYER_ID,
      expect.any(Object)
    )
  })
})
