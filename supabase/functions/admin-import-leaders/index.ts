import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type LeaderRecord = {
  name: string
  leader_type: string
  faction?: string | null
  text?: string | null
  unlock_criteria?: string | null
  effects?: unknown
  handler?: string | null
  exhausts_source?: boolean
  purges_source?: boolean
  trigger?: unknown
  source_type?: string
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

  // Delete existing data (order matters due to FK constraints)
  await db.from('ability_sources').delete().eq('source_type', 'leader')
  await db.from('leaders').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  for (const record of body.records as LeaderRecord[]) {
    // Insert leader row
    const { data: leader, error: leaderError } = await db
      .from('leaders')
      .insert({
        name: record.name,
        leader_type: record.leader_type,
        faction: record.faction ?? null,
        text: record.text ?? null,
        unlock_criteria: record.unlock_criteria ?? null,
      })
      .select('id')
      .single()

    if (leaderError) return errorResponse(`Insert failed: ${leaderError.message}`, 500)

    // Insert ability_definition row
    const { data: def, error: defError } = await db
      .from('ability_definitions')
      .insert({
        effects: record.effects ?? null,
        handler: record.handler ?? null,
        exhausts_source: record.exhausts_source ?? false,
        purges_source: record.purges_source ?? false,
        trigger: record.trigger ?? null,
        source_type: 'leader',
      })
      .select('id')
      .single()

    if (defError) return errorResponse(`Insert failed: ${defError.message}`, 500)

    // Link via ability_sources
    const { error: srcError } = await db
      .from('ability_sources')
      .insert({
        source_type: 'leader',
        source_id: (leader as Record<string, string>).id,
        ability_definition_id: (def as Record<string, string>).id,
      })

    if (srcError) return errorResponse(`Insert failed: ${srcError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
