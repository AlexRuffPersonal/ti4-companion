import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const NOTE_HANDLER_MAP: Record<string, string> = {
  'Ceasefire': 'ceasefire',
  'Political Secret': 'politicalSecret',
  'Trade Convoys': 'tradeConvoys',
  'Promise Of Protection': 'promiseOfProtection',
  'Blood Pact': 'bloodPact',
  'Dark Pact': 'darkPact',
  'Stymie': 'stymie',
  'Antivirus': 'antivirus',
  'Gift Of Prescience': 'giftOfPrescience',
  'Trade Agreement': 'tradeAgreement',
  'Alliance': 'alliance',
  'Support For The Throne': 'supportForThrone',
  'Political Favor': 'politicalFavor',
  'Acquisecence': 'acquiescence',
  'Fires Of The Gashlai': 'firesOfTheGashlai',
  'Cybernetic Enhancements': 'cyberneticEnhancements',
  'Military Support': 'militarySupport',
  "Ragh's Call": 'raghsCall',
  'War Funding': 'warFunding',
  'Research Agreement': 'researchAgreement',
  'Greyfire Mutagen': 'greyfireMutagen',
  'The Cavalry': 'theCavalry',
  'Tekklar Legion': 'tekklarLegion',
  'Terraform': 'terraform',
  'Creuss Iff': 'creussIff',
  'Spy Net': 'spyNet',
  'Strike Wing Ambuscade': 'strikeWingAmbuscade',
  'Crucible': 'crucible',
  'Scepter Of Dominion': 'scepterOfDominion',
  'Black Market Forgery': 'blackMarketForgery',
}

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
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

  const { error: deleteError } = await db.from('promissory_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const rows = (body.records as Record<string, unknown>[]).map(r => {
    const { returns_to_owner: _rto, ...rest } = r as Record<string, unknown>
    return {
      ...rest,
      expansion: rest.expansion ?? 'base',
      purge_on_use: rest.purge_on_use ?? false,
      into_play_area: rest.into_play_area ?? false,
    }
  })
  const { error: insertError } = await db.from('promissory_notes').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  // ── Re-seed ability_definitions and ability_sources ──────────────────────

  // 1. Upsert ability_definitions for all known handler keys
  const abilityDefs = Object.values(NOTE_HANDLER_MAP).map(handlerKey => ({
    ability_key: handlerKey,
    ability_name: handlerKey,
    trigger: { type: 'play' },
    handler: handlerKey,
    exhausts_source: false,
    purges_source: false,
  }))
  const { error: upsertError } = await db
    .from('ability_definitions')
    .upsert(abilityDefs, { onConflict: 'ability_key' })
  if (upsertError) return errorResponse(`Ability definitions upsert failed: ${upsertError.message}`, 500)

  // 2. Delete existing ability_sources for promissory_note source_type
  const { error: srcDeleteError } = await db
    .from('ability_sources')
    .delete()
    .eq('source_type', 'promissory_note')
  if (srcDeleteError) return errorResponse(`Ability sources delete failed: ${srcDeleteError.message}`, 500)

  // 3. Re-fetch just-inserted notes and ability_definitions, then re-insert ability_sources
  const noteNames = Object.keys(NOTE_HANDLER_MAP)
  const { data: insertedNotes, error: notesRefetchError } = await db
    .from('promissory_notes')
    .select('id, name')
    .in('name', noteNames)
  if (notesRefetchError) return errorResponse(`Notes re-fetch failed: ${notesRefetchError.message}`, 500)

  const { data: insertedDefs, error: defsRefetchError } = await db
    .from('ability_definitions')
    .select('id, ability_key')
    .in('ability_key', Object.values(NOTE_HANDLER_MAP))
  if (defsRefetchError) return errorResponse(`Ability definitions re-fetch failed: ${defsRefetchError.message}`, 500)

  const noteMap = Object.fromEntries(
    ((insertedNotes ?? []) as Array<{ id: string; name: string }>).map(n => [n.name, n.id])
  )
  const defMap = Object.fromEntries(
    ((insertedDefs ?? []) as Array<{ id: string; ability_key: string }>).map(d => [d.ability_key, d.id])
  )

  const sourcesToInsert = Object.entries(NOTE_HANDLER_MAP)
    .filter(([noteName, handlerKey]) => noteMap[noteName] && defMap[handlerKey])
    .map(([noteName, handlerKey]) => ({
      ability_id: defMap[handlerKey],
      source_type: 'promissory_note',
      source_id: noteMap[noteName],
    }))

  if (sourcesToInsert.length > 0) {
    const { error: srcInsertError } = await db.from('ability_sources').insert(sourcesToInsert)
    if (srcInsertError) return errorResponse(`Ability sources insert failed: ${srcInsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length, abilitiesLinked: sourcesToInsert.length })
})
