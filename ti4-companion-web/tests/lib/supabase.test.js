import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('exports a supabase client object', async () => {
    const { supabase } = await import('../../src/lib/supabase.js')
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth.getSession).toBe('function')
  })

  it('throws if env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.resetModules()
    await expect(import('../../src/lib/supabase.js')).rejects.toThrow(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY'
    )
  })
})
