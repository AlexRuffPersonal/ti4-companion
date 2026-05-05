import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  importTable,
  moveShips,
  updateRecord,
  rollRiftDice,
  playActionCard,
  passActionWindow,
} from '../../src/lib/edgeFunctions.js'

describe('importTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct edge function with records payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { imported: 3 }, error: null })
    const records = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const result = await importTable('tiles', records)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-import-tiles', {
      body: { records },
    })
    expect(result).toEqual({ imported: 3 })
  })

  it('throws when the edge function returns an error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Forbidden' } })
    await expect(importTable('factions', [])).rejects.toThrow('Forbidden')
  })
})

describe('moveShips', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-move-ships with game_id and spread payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const payload = { system_key: '1,0', unit_ids: ['u1'] }
    await moveShips('game-1', payload)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-move-ships', {
      body: { game_id: 'game-1', system_key: '1,0', unit_ids: ['u1'] },
    })
  })
})

describe('updateRecord', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls admin-update-record with table and record', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: 1 }, error: null })
    const record = { id: 'rec-1', name: 'Test' }
    await updateRecord('factions', record)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-update-record', {
      body: { table: 'factions', record },
    })
  })
})

describe('rollRiftDice', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-roll-rift-dice with transit_id, roll_all, unit_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { rolls: [3] }, error: null })
    await rollRiftDice('transit-1', false, 'unit-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-roll-rift-dice', {
      body: { transit_id: 'transit-1', roll_all: false, unit_id: 'unit-1' },
    })
  })
})

describe('playActionCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-play-action-card with game_id, card_id, selections', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const selections = { target_player_id: 'p2' }
    await playActionCard('game-1', 'card-1', selections)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-action-card', {
      body: { game_id: 'game-1', card_id: 'card-1', selections },
    })
  })
})

describe('passActionWindow', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-pass-action-window with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await passActionWindow('game-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-pass-action-window', {
      body: { game_id: 'game-1' },
    })
  })
})
