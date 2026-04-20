import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_TYPES = new Set(['law', 'directive', 'special'])
const VALID_OUTCOMES = new Set(['for_against', 'elect', 'unknown'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.type || typeof r.type !== 'string' || !VALID_TYPES.has(r.type as string))
    return `Record ${index}: 'type' must be one of: law, directive, special`
  if (!r.outcome || typeof r.outcome !== 'string' || !VALID_OUTCOMES.has(r.outcome as string))
    return `Record ${index}: 'outcome' must be one of: for_against, elect, unknown`
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  try {
    await requireServiceRole(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")
  if (body.records.length === 0) return errorResponse("'records' must not be empty")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  // Note: delete and insert are not atomic — if insert fails, the table will be empty until re-imported.
  const { error: deleteError } = await db.from('agendas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ...r,
    expansion: r.expansion ?? 'base',
    tractable: r.tractable ?? false,
    effect_json: r.effect_json ?? {},
  }))
  const { error: insertError } = await db.from('agendas').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
