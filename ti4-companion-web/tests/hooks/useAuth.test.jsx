import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../../src/hooks/useAuth.js'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '../../src/lib/supabase.js'

// Helper: mock onAuthStateChange to immediately fire callback with the given session.
// The hook makes onAuthStateChange the sole owner of setLoading(false) — getSession
// was removed to fix a race condition with magic link auth (see useAuth.js comments).
function mockAuthChange(session) {
  supabase.auth.onAuthStateChange.mockImplementation((callback) => {
    callback('INITIAL_SESSION', session)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
}

describe('useAuth — isAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isAdmin: false when there is no session', async () => {
    mockAuthChange(null)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns isAdmin: true when profiles.is_admin is true', async () => {
    const mockUser = { id: 'user-admin' }
    mockAuthChange({ user: mockUser })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: true }, error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-admin')
  })

  it('returns isAdmin: false when profiles.is_admin is false', async () => {
    const mockUser = { id: 'user-regular' }
    mockAuthChange({ user: mockUser })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: false }, error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
  })

  it('returns isAdmin: false when profiles fetch fails', async () => {
    const mockUser = { id: 'user-broken' }
    mockAuthChange({ user: mockUser })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
  })
})
