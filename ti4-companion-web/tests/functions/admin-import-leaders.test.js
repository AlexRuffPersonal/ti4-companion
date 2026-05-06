import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { handler } from '../../../supabase/functions/admin-import-leaders/index.ts'

const LEADER_ID = 'leader-uuid'
const DEF_ID = 'def-uuid'

function makeRequest(body) {
  return new Request('http://localhost/admin-import-leaders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const SAMPLE_RECORD = {
  name: 'Jae Mir Kan',
  leader_type: 'agent',
  faction: 'Naalu Collective',
  text: 'At the start of a space combat...',
  unlock_criteria: null,
  effects: null,
  handler: 'naalu_agent',
  exhausts_source: true,
  purges_source: false,
  trigger: { type: 'action' },
}

function mockDb({ deleteError = null, insertError = null } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'ability_sources') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: deleteError }),
        }),
        insert: vi.fn().mockResolvedValue({ error: insertError }),
      }
    }
    if (table === 'leaders') {
      return {
        delete: vi.fn().mockReturnValue({
          neq: vi.fn().mockResolvedValue({ error: deleteError }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: LEADER_ID }, error: insertError }),
          }),
        }),
      }
    }
    if (table === 'ability_definitions') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: DEF_ID }, error: insertError }),
          }),
        }),
      }
    }
    return { select: vi.fn(), insert: vi.fn(), delete: vi.fn() }
  })
}

describe('admin-import-leaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAdmin.mockResolvedValue('admin-user-id')
  })

  it('401 unauthenticated', async () => {
    requireAdmin.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/missing or invalid/i)
  })

  it('403 forbidden for non-admin', async () => {
    requireAdmin.mockRejectedValue(new AuthError('Forbidden: admin access required'))
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })

  it('400 records missing', async () => {
    const res = await handler(makeRequest({ other: 'data' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/records/i)
  })

  it('imports 1 leader and creates ability rows', async () => {
    const res = await handler(makeRequest({ records: [SAMPLE_RECORD] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(1)
  })

  it('imports multiple leaders', async () => {
    const records = [SAMPLE_RECORD, { ...SAMPLE_RECORD, name: 'Rin, The Masters Legacy' }]
    const res = await handler(makeRequest({ records }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(2)
  })
})
