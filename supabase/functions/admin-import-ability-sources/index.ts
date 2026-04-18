import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const SOURCE_TYPE_TABLE: Record<string, string> = {
  action_card: 'action_cards',
  leader: 'leaders',
  relic: 'relics',
  promissory_note: 'promissory_notes',
  exploration_card: 'exploration_cards',
  technology: 'technologies',
}

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.ability_key || typeof r.ability_key !== 'string')
    return `Record ${index}: missing or invalid 'ability_key'`
  if (!r.source_type || typeof r.source_type !== 'string')
    return `Record ${index}: missing or invalid 'source_type'`
  const validTypes = Object.keys(SOURCE_TYPE_TABLE).concat(['faction_ability'])
  if (!validTypes.includes(r.source_type as string))
    return `Record ${index}: invalid source_type '${r.source_type}'. Must be one of: ${validTypes.join(', ')}`
  if (r.source_type === 'faction_ability') {
    if (!r.faction_name || typeof r.faction_name !== 'string')
      return `Record ${index}: 'faction_name' is required when source_type is 'faction_ability'`
  } else {
    if (!r.source_name || typeof r.source_name !== 'string')
      return `Record ${index}: 'source_name' is required for source_type '${r.source_type}'`
  }
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

  const records = body.records as Record<string, unknown>[]

  // Resolve all ability_keys to UUIDs in one query
  const abilityKeys = [...new Set(records.map(r => r.ability_key as string))]
  const { data: abilityDefs, error: abilityLookupError } = await db
    .from('ability_definitions')
    .select('id, ability_key')
    .in('ability_key', abilityKeys)
  if (abilityLookupError) return errorResponse(`Ability lookup failed: ${abilityLookupError.message}`, 500)

  const abilityKeyToId = Object.fromEntries(
    (abilityDefs ?? []).map((a: Record<string, string>) => [a.ability_key, a.id])
  )

  const missingKey = abilityKeys.find(k => !abilityKeyToId[k])
  if (missingKey) return errorResponse(`ability_key '${missingKey}' not found in ability_definitions`, 400)

  // Resolve source names to UUIDs per source_type
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const abilityId = abilityKeyToId[r.ability_key as string]

    if (r.source_type === 'faction_ability') {
      rows.push({ ability_id: abilityId, source_type: 'faction_ability', source_id: null, faction_name: r.faction_name })
      continue
    }

    const table = SOURCE_TYPE_TABLE[r.source_type as string]
    const { data: sourceRow, error: sourceLookupError } = await db
      .from(table)
      .select('id')
      .eq('name', r.source_name)
      .maybeSingle()
    if (sourceLookupError) return errorResponse(`Source lookup failed: ${sourceLookupError.message}`, 500)
    if (!sourceRow) return errorResponse(`Record ${i + 1}: source_name '${r.source_name}' not found in ${table}`, 400)

    rows.push({ ability_id: abilityId, source_type: r.source_type, source_id: sourceRow.id, faction_name: null })
  }

  const { error: deleteError } = await db
    .from('ability_sources')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('ability_sources').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: rows.length })
})
