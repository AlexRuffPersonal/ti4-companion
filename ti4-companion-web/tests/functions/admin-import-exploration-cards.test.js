import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireServiceRole: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireServiceRole, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
const makeRequest = (body) => _makeRequest('admin-import-exploration-cards', body)

function mockDb({ deleteError = null, insertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn } }
  await import('../../../supabase/functions/admin-import-exploration-cards/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('admin-import-exploration-cards', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('returns 403 for authenticated non-admin users', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Forbidden: admin access required'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })

  it('returns 400 when a required field is missing', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ name: 'Cybernetic Enhancements' }] })) // missing deck_type
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/deck_type/)
    expect(body.error).toMatch(/Record 1/)
  })

  it('returns 400 when deck_type enum value is invalid', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ name: 'Test', deck_type: 'invalid' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/deck_type/)
  })

  it('returns 200 with imported count on valid payload', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const records = [
      { name: 'Cybernetic Enhancements', deck_type: 'industrial' },
      { name: 'Abandoned Warehouses', deck_type: 'cultural' },
    ]
    const res = await handler(makeRequest({ records }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(2)
  })

  it('returns 500 when the database insert fails', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    mockDb({ insertError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ records: [{ name: 'Cybernetic Enhancements', deck_type: 'industrial' }] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/insert failed/i)
  })
})
