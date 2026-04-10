import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (typeof r.stage !== 'number' || !Number.isInteger(r.stage))
    return `Record ${index}: 'stage' must be an integer`
  if (!r.condition || typeof r.condition !== 'string')
    return `Record ${index}: missing or invalid 'condition'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
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

  const { error: deleteError } = await db.from('public_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('public_objectives').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
