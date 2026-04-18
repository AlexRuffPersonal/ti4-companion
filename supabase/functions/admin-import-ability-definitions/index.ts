import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.ability_key || typeof r.ability_key !== 'string')
    return `Record ${index}: missing or invalid 'ability_key'`
  if (!r.ability_name || typeof r.ability_name !== 'string')
    return `Record ${index}: missing or invalid 'ability_name'`
  if (!r.trigger || typeof r.trigger !== 'object')
    return `Record ${index}: missing or invalid 'trigger' (must be a JSON object)`
  if (r.effects && r.handler)
    return `Record ${index}: cannot have both 'effects' and 'handler'`
  if (!r.effects && !r.handler)
    return `Record ${index}: must have either 'effects' or 'handler'`
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

  const { error: deleteError } = await db
    .from('ability_definitions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ability_key: r.ability_key,
    ability_name: r.ability_name,
    trigger: r.trigger,
    unlock_conditions: r.unlock_conditions ?? null,
    effects: r.effects ?? null,
    handler: r.handler ?? null,
    exhausts_source: r.exhausts_source ?? false,
    purges_source: r.purges_source ?? false,
  }))

  const { error: insertError } = await db.from('ability_definitions').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: rows.length })
})
