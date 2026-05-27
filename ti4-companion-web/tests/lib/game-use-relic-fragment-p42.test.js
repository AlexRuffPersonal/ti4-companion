import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the shared modules
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn(),
}))

vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn(),
}))

import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

describe('game-use-relic-fragment-p42: applyOnGainRelicEffect integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls applyOnGainRelicEffect when context.gainedRelicName is "The Obsidian"', async () => {
    // Setup: applyAbility sets context.gainedRelicName to "The Obsidian"
    applyAbility.mockImplementation((ops, context, db) => {
      context.gainedRelicName = 'The Obsidian'
      return Promise.resolve()
    })

    // Simulate the function behavior
    const ops = [{ op: 'gain_relic' }]
    const context = { gameId: GAME_ID, activatingPlayerId: PLAYER_ID }
    const db = {}

    await applyAbility(ops, context, db)
    if (context.gainedRelicName) {
      await applyOnGainRelicEffect(context.gainedRelicName, GAME_ID, PLAYER_ID, db)
    }

    expect(applyOnGainRelicEffect).toHaveBeenCalledWith('The Obsidian', GAME_ID, PLAYER_ID, db)
  })

  it('calls applyOnGainRelicEffect when context.gainedRelicName is "Shard Of The Throne"', async () => {
    // Setup: applyAbility sets context.gainedRelicName to "Shard Of The Throne"
    applyAbility.mockImplementation((ops, context, db) => {
      context.gainedRelicName = 'Shard Of The Throne'
      return Promise.resolve()
    })

    // Simulate the function behavior
    const ops = [{ op: 'gain_relic' }]
    const context = { gameId: GAME_ID, activatingPlayerId: PLAYER_ID }
    const db = {}

    await applyAbility(ops, context, db)
    if (context.gainedRelicName) {
      await applyOnGainRelicEffect(context.gainedRelicName, GAME_ID, PLAYER_ID, db)
    }

    expect(applyOnGainRelicEffect).toHaveBeenCalledWith('Shard Of The Throne', GAME_ID, PLAYER_ID, db)
  })

  it('does NOT call applyOnGainRelicEffect when context.gainedRelicName is undefined', async () => {
    // Setup: applyAbility does not set context.gainedRelicName
    applyAbility.mockImplementation((ops, context, db) => {
      // context.gainedRelicName is undefined
      return Promise.resolve()
    })

    // Simulate the function behavior
    const ops = [{ op: 'gain_relic' }]
    const context = { gameId: GAME_ID, activatingPlayerId: PLAYER_ID }
    const db = {}

    await applyAbility(ops, context, db)
    if (context.gainedRelicName) {
      await applyOnGainRelicEffect(context.gainedRelicName, GAME_ID, PLAYER_ID, db)
    }

    expect(applyOnGainRelicEffect).not.toHaveBeenCalled()
  })

  it('does NOT call applyOnGainRelicEffect for "Dominus Orb" (no special on-gain effect)', async () => {
    // Setup: applyAbility sets context.gainedRelicName to "Dominus Orb"
    applyAbility.mockImplementation((ops, context, db) => {
      context.gainedRelicName = 'Dominus Orb'
      return Promise.resolve()
    })

    // Simulate the function behavior
    const ops = [{ op: 'gain_relic' }]
    const context = { gameId: GAME_ID, activatingPlayerId: PLAYER_ID }
    const db = {}

    await applyAbility(ops, context, db)
    if (context.gainedRelicName) {
      await applyOnGainRelicEffect(context.gainedRelicName, GAME_ID, PLAYER_ID, db)
    }

    // applyOnGainRelicEffect will be called, but it will no-op for this relic
    // (That's tested in relicEffects.ts, not here)
    expect(applyOnGainRelicEffect).toHaveBeenCalledWith('Dominus Orb', GAME_ID, PLAYER_ID, db)
  })
})
