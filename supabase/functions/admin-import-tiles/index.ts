import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_TYPES = new Set(['blue', 'red', 'faction', 'mecatol_rex', 'wormhole_nexus'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.tile_number || typeof r.tile_number !== 'string')
    return `Record ${index}: missing or invalid 'tile_number'`
  if (!r.type || typeof r.type !== 'string' || !VALID_TYPES.has(r.type as string))
    return `Record ${index}: 'type' must be one of: blue, red, faction, mecatol_rex, wormhole_nexus`
  if (r.wormholes !== undefined && !Array.isArray(r.wormholes))
    return `Record ${index}: 'wormholes' must be an array`
  if (r.anomalies !== undefined && !Array.isArray(r.anomalies))
    return `Record ${index}: 'anomalies' must be an array`
  if (r.starts_off_board !== undefined && typeof r.starts_off_board !== 'boolean')
    return `Record ${index}: 'starts_off_board' must be a boolean`
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  try {
    requireServiceRole(req)
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
  const { error: deleteError } = await db.from('tiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ...r,
    wormholes: r.wormholes ?? [],
    anomalies: r.anomalies ?? [],
    starts_off_board: r.starts_off_board ?? false,
  }))
  const { error: insertError } = await db.from('tiles').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
