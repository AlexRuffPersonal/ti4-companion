import { describe, it, expect, vi, beforeEach } from 'vitest'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

// Mock applyAbility before importing applyOnGainRelicEffect
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn(),
}))

import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'

const applyAbilityMock = vi.mocked(applyAbility)

// Helper: build a mock db with proper chain methods and tracked calls
function makeDb({ initialVp = 5 } = {}) {
  const selectChain = {
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { vp: initialVp },
        error: null,
      }),
    }),
  }

  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  }

  const updateMock = vi.fn().mockReturnValue(updateChain)

  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue(selectChain),
          update: updateMock,
        }
      }
      return {}
    }),
  }

  return { db, updateMock, updateChain, selectChain }
}

describe('game-resolve-exploration-card-p42: applyOnGainRelicEffect integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolving a gain_relic card for The Obsidian triggers draw_secret_objective", async () => {
    const { db } = makeDb()

    await applyOnGainRelicEffect('The Obsidian', GAME_ID, PLAYER_ID, db)

    // Verify that applyAbility was called with draw_secret_objective
    expect(applyAbilityMock).toHaveBeenCalledWith(
      [{ op: 'draw_secret_objective' }],
      expect.objectContaining({ gameId: GAME_ID, activatingPlayerId: PLAYER_ID }),
      db
    )
  })

  it("resolving a gain_relic card for Shard Of The Throne awards VP", async () => {
    const { db, updateMock, updateChain } = makeDb({ initialVp: 5 })

    await applyOnGainRelicEffect('Shard Of The Throne', GAME_ID, PLAYER_ID, db)

    // Verify VP was incremented from 5 to 6
    expect(updateMock).toHaveBeenCalledWith({ vp: 6 })
    expect(updateChain.eq).toHaveBeenCalledWith('id', PLAYER_ID)
  })
})
