import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { discardSecretObjective, scoreSecretObjective, statusPhase } from '../../src/lib/edgeFunctions.js'

describe('Phase 6 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('discardSecretObjective calls game-discard-secret-objective with game_id and objective_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { discarded: true }, error: null })
    await discardSecretObjective('g1', 'obj-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-discard-secret-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid' },
    })
  })

  it('scoreSecretObjective calls game-score-secret-objective with game_id and objective_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { scored: true }, error: null })
    await scoreSecretObjective('g1', 'obj-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-score-secret-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid' },
    })
  })

  it('statusPhase calls game-status-phase with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await statusPhase('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-status-phase', {
      body: { game_id: 'g1' },
    })
  })
})