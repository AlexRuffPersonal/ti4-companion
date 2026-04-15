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

function makeRequest(body) {
  return new Request('http://localhost/admin-import-factions', {
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
  await import('../../../supabase/functions/admin-import-factions/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('admin-import-factions', () => {
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

  it('returns 400 when name field is missing', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ other: 'data' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/)
    expect(body.error).toMatch(/Record 1/)
  })

  it('returns 400 when name is not a string', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const res = await handler(makeRequest({ records: [{ name: 123 }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/)
  })

  it('returns 200 with imported count on valid payload', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    const records = [{ name: 'Barony of Letnev' }, { name: 'Federation of Sol' }]
    const res = await handler(makeRequest({ records }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(2)
  })

  it('returns 500 when the database insert fails', async () => {
    requireServiceRole.mockResolvedValue('user-id')
    mockDb({ insertError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ records: [{ name: 'Barony of Letnev' }] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/insert failed/i)
  })
})
