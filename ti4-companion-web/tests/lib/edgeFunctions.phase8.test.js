import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { createTransaction, confirmTransaction, rejectTransaction, rescindTransaction, playPromissoryNote } from '../../src/lib/edgeFunctions.js'

describe('Phase 8 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createTransaction calls game-create-transaction with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { created: true }, error: null })
    await createTransaction('g1', 'p2', { resources: 5 }, { commodities: 3 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-create-transaction', {
      body: { game_id: 'g1', to_player_id: 'p2', offer: { resources: 5 }, request: { commodities: 3 } },
    })
  })

  it('confirmTransaction calls game-confirm-transaction with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { confirmed: true }, error: null })
    await confirmTransaction('g1', 'tx-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-confirm-transaction', {
      body: { game_id: 'g1', transaction_id: 'tx-uuid' },
    })
  })

  it('rejectTransaction calls game-reject-transaction with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { rejected: true }, error: null })
    await rejectTransaction('g1', 'tx-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-reject-transaction', {
      body: { game_id: 'g1', transaction_id: 'tx-uuid' },
    })
  })

  it('rescindTransaction calls game-rescind-transaction with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { rescinded: true }, error: null })
    await rescindTransaction('g1', 'tx-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-rescind-transaction', {
      body: { game_id: 'g1', transaction_id: 'tx-uuid' },
    })
  })

  it('playPromissoryNote calls game-play-promissory-note with the correct parameters', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { played: true }, error: null })
    await playPromissoryNote('g1', 'note-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-promissory-note', {
      body: { game_id: 'g1', note_instance_id: 'note-uuid' },
    })
  })
})