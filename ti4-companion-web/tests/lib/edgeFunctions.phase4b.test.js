import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { drawActionCard, discardActionCard } from '../../src/lib/edgeFunctions.js'

describe('Phase 4b edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drawActionCard calls game-draw-action-card with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { drawn: true }, error: null })
    await drawActionCard('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-draw-action-card', { body: { game_id: 'g1' } })
  })

  it('discardActionCard calls game-discard-action-card with game_id and card_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { discarded: true }, error: null })
    await discardActionCard('g1', 'card-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-discard-action-card', {
      body: { game_id: 'g1', card_id: 'card-uuid' },
    })
  })
})
