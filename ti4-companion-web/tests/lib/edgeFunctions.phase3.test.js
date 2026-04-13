import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  endTurn,
  passAction,
  advancePhase,
  scoreObjective,
  revealObjective,
  shuffleDeck,
  updateCommandTokens,
} from '../../src/lib/edgeFunctions.js'

describe('Phase 3 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('endTurn calls game-end-turn with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await endTurn('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-end-turn', { body: { game_id: 'g1' } })
  })

  it('passAction calls game-player-pass with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { passed: true }, error: null })
    await passAction('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-player-pass', { body: { game_id: 'g1' } })
  })

  it('advancePhase calls game-advance-phase with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await advancePhase('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-advance-phase', { body: { game_id: 'g1' } })
  })

  it('scoreObjective calls game-score-objective with correct args', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { scored: true, vp_awarded: 1 }, error: null })
    await scoreObjective('g1', 'obj-uuid', 'player-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-score-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid', player_id: 'player-uuid' },
    })
  })

  it('revealObjective calls game-reveal-objective with game_id and stage', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { revealed: true }, error: null })
    await revealObjective('g1', 1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-reveal-objective', {
      body: { game_id: 'g1', stage: 1 },
    })
  })

  it('shuffleDeck calls game-shuffle-deck with game_id and deck_type', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { shuffled: 5 }, error: null })
    await shuffleDeck('g1', 'public_objectives_1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-shuffle-deck', {
      body: { game_id: 'g1', deck_type: 'public_objectives_1' },
    })
  })

  it('updateCommandTokens calls game-update-command-tokens with token counts', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await updateCommandTokens('g1', { tactic_total: 3, fleet: 3, strategy: 2 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-update-command-tokens', {
      body: { game_id: 'g1', tactic_total: 3, fleet: 3, strategy: 2 },
    })
  })
})
