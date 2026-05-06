import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const ADMIN_ALLOWLIST = [
  'tiles', 'factions', 'agendas', 'technologies', 'units',
  'public_objectives', 'secret_objectives', 'action_cards',
  'relics', 'exploration_cards', 'attachments', 'promissory_notes',
  'ability_definitions', 'ability_sources',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { table?: unknown; record?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.table || typeof body.table !== 'string') return errorResponse("'table' is required")
  if (!body.record || typeof body.record !== 'object' || Array.isArray(body.record)) return errorResponse("'record' is required")
  if (!ADMIN_ALLOWLIST.includes(body.table)) return errorResponse('Invalid table', 400)

  const { data: profile } = await db
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  if (!profile?.is_admin) return errorResponse('Forbidden', 403)

  const { error } = await db.from(body.table).upsert(body.record, { onConflict: 'id' })
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  return okResponse({ updated: 1 })
})
