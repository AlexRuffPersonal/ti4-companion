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
  return new Request('http://localhost/admin-import-technologies', {
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
  await import('../../../supabase/functions/admin-import-technologies/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
})

describe('admin-import-technologies', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('returns 403 for invalid service key', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Forbidden: invalid service key'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })

  it('returns 400 when technology_type field is missing', async () => {
    requireServiceRole.mockResolvedValue(undefined)
    const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/technology_type/)
    expect(body.error).toMatch(/Record 1/)
  })

  it('returns 400 when technology_type enum value is invalid', async () => {
    requireServiceRole.mockResolvedValue(undefined)
    const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator', technology_type: 'purple' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/technology_type/)
  })

  it('returns 200 with imported count on valid payload', async () => {
    requireServiceRole.mockResolvedValue(undefined)
    const records = [
      { name: 'Neural Motivator', technology_type: 'blue' },
      { name: 'Sarween Tools', technology_type: 'yellow' },
      { name: 'War Sun', technology_type: 'unit_upgrade' },
    ]
    const res = await handler(makeRequest({ records }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(3)
  })

  it('returns 500 when the database insert fails', async () => {
    requireServiceRole.mockResolvedValue(undefined)
    mockDb({ insertError: { message: 'constraint violation' } })
    const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator', technology_type: 'blue' }] }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/insert failed/i)
  })
})
