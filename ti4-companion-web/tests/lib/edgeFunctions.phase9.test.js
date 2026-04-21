import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { activateSystem, landTroops } from '../../src/lib/edgeFunctions.js'

describe('Phase 9 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('activateSystem calls game-activate-system with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { activated: true }, error: null })
    await activateSystem('g1', '1,-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-activate-system', {
      body: { game_id: 'g1', system_key: '1,-1' },
    })
  })

  it('landTroops calls game-land-troops with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { claimed: true }, error: null })
    await landTroops('g1', '0,0', 'Mecatol Rex', 1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-land-troops', {
      body: { game_id: 'g1', system_key: '0,0', planet_name: 'Mecatol Rex', troop_count: 1 },
    })
  })

  it('activateSystem throws on error', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Not the active player', instanceof: FunctionsHttpError },
    })
    supabase.functions.invoke.mockRejectedValueOnce(new Error('Not the active player'))
    await expect(activateSystem('g1', '1,0')).rejects.toThrow()
  })
})