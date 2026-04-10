import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from '../../src/lib/supabase.js'
import { importTable } from '../../src/lib/edgeFunctions.js'

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
