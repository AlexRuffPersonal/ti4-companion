import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAdmin: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireAdmin, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

function makeRequest(body) {
  return new Request('http://localhost/admin-import-agendas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockDb({ deleteError = null, insertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn } }
  await import('../../../supabase/functions/admin-import-agendas/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('admin-import-agendas', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAdmin.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('returns 403 for authenticated non-admin users', async () => {
    requireAdmin.mockRejectedValue(new AuthError('Forbidden: admin access required'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })

  it('returns 400 when a required field is missing', async () => {
    requireAdmin.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ name: 'Holy Planet' }] })) // missing type, outcome
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/type/)
    expect(body.error).toMatch(/Record 1/)
  })

  it('returns 400 when type enum value is invalid', async () => {
    requireAdmin.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ name: 'Test', type: 'invalid', outcome: 'For/Against' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/type/)
  })

  it('returns 200 with imported count on valid payload', async () => {
    requireAdmin.mockResolvedValue('user-id')
    const records = [
      { name: 'Holy Planet of Ixth', type: 'law', outcome: 'For/Against' },
      { name: 'Incentive Program', type: 'directive', outcome: 'For/Against' },
    ]
    const res = await handler(makeRequest({ records }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(2)
  })

  it('returns 500 when the database insert fails', async () => {
    requireAdmin.mockResolvedValue('user-id')
    mockDb({ insertError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ records: [{ name: 'Test', type: 'law', outcome: 'For/Against' }] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/insert failed/i)
  })
})
