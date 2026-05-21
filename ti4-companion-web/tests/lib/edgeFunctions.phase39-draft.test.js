import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { startDraft, draftPickSlice, draftPlaceTile } from '../../src/lib/edgeFunctions.js'

describe('Phase 39 draft edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('startDraft calls game-start-draft with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { mode: 'official', phase: 'placement' }, error: null })
    await startDraft('game-1', 'official')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-start-draft', {
      body: { game_id: 'game-1', mode: 'official' },
    })
  })

  it('startDraft passes milty mode', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { mode: 'milty', phase: 'slice-pick' }, error: null })
    await startDraft('game-2', 'milty')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-start-draft', {
      body: { game_id: 'game-2', mode: 'milty' },
    })
  })

  it('draftPickSlice calls game-draft-pick-slice with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { phase: 'slice-pick' }, error: null })
    await draftPickSlice('game-1', 'slice-0')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-draft-pick-slice', {
      body: { game_id: 'game-1', slice_id: 'slice-0' },
    })
  })

  it('draftPlaceTile calls game-draft-place-tile with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { complete: false, next_player: 'p2' }, error: null })
    await draftPlaceTile('game-1', 'b1', '1,0', 2)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-draft-place-tile', {
      body: { game_id: 'game-1', tile_number: 'b1', position: '1,0', rotation: 2 },
    })
  })

  it('draftPlaceTile uses default rotation=0 when not provided', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { complete: false }, error: null })
    await draftPlaceTile('game-1', 'b2', '0,1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-draft-place-tile', {
      body: { game_id: 'game-1', tile_number: 'b2', position: '0,1', rotation: 0 },
    })
  })

  it('startDraft throws on error', async () => {
    supabase.functions.invoke.mockRejectedValueOnce(new Error('Not the host'))
    await expect(startDraft('game-1', 'official')).rejects.toThrow()
  })
})
