import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { playPromissoryNote } from '../../src/lib/edgeFunctions.js'

describe('Phase 45 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('playPromissoryNote with planet_name calls game-play-promissory-note with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { played: true }, error: null })
    await playPromissoryNote('g1', 'note-uuid', { planet_name: 'Mecatol Rex' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-promissory-note', {
      body: { game_id: 'g1', note_instance_id: 'note-uuid', planet_name: 'Mecatol Rex' },
    })
  })

  it('playPromissoryNote with fragment_ids calls game-play-promissory-note with selections', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { played: true }, error: null })
    await playPromissoryNote('g1', 'note-uuid', { fragment_ids: ['a', 'b'] })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-promissory-note', {
      body: { game_id: 'g1', note_instance_id: 'note-uuid', selections: { fragment_ids: ['a', 'b'] } },
    })
  })

  it('playPromissoryNote with no options calls game-play-promissory-note with minimal parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { played: true }, error: null })
    await playPromissoryNote('g1', 'note-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-promissory-note', {
      body: { game_id: 'g1', note_instance_id: 'note-uuid' },
    })
  })
})
