import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type LeaderRecord = {
  name: string
  leader_type: string
  faction: string
  text?: string | null
  unlock_criteria?: string | null
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  try { await requireAdmin(req) } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' is required and must be an array")

  await db.from('leaders').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const records = (body.records as LeaderRecord[]).map(r => ({
    name: r.name,
    leader_type: r.leader_type,
    faction: r.faction,
    text: r.text ?? null,
    unlock_criteria: r.unlock_criteria ?? null,
  }))

  const { error } = await db.from('leaders').insert(records)
  if (error) return errorResponse(`Insert failed: ${error.message}`, 500)

  return okResponse({ imported: records.length })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
