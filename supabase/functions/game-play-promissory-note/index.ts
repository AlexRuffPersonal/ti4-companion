import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }
  let body: { game_id?: unknown; note_instance_id?: unknown; selections?: Record<string, unknown> }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.note_instance_id || typeof body.note_instance_id !== 'string') return errorResponse("'note_instance_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found', 404)

  const { data: noteRow, error: noteRowError } = await db
    .from('game_player_promissory_notes')
    .select('id, state, held_by_player_id, note_id, origin_player_id')
    .eq('id', body.note_instance_id)
    .maybeSingle()
  if (noteRowError) return errorResponse('Database error', 500)
  if (!noteRow) return errorResponse('Note not found', 404)

  if (noteRow.held_by_player_id !== player.id) return errorResponse('You do not hold this note', 403)
  if (noteRow.state !== 'held') return errorResponse('Note is not held', 409)

  const { data: abilitySource } = await db
    .from('ability_sources')
    .select('ability_definition_id, ability_definitions(id, handler_key, effects)')
    .eq('source_type', 'promissory_note')
    .eq('source_id', noteRow.note_id)
    .maybeSingle()

  if (!abilitySource) return errorResponse('No ability definition for this note', 404)
  // Full ability resolution wired in Phase 30; for now we just track the play
  // const _abilityDef = abilitySource.ability_definitions as Record<string, unknown>
  // const _selections = body.selections ?? {}

  const { data: noteRefData, error: noteRefError } = await db
    .from('promissory_notes')
    .select('purge_on_use, into_play_area')
    .eq('id', noteRow.note_id)
    .maybeSingle()
  if (noteRefError) return errorResponse('Database error', 500)

  let newState: string
  if (noteRefData?.into_play_area) {
    newState = 'in_play'
    // held_by_player_id unchanged
  } else if (noteRefData?.purge_on_use) {
    newState = 'discarded'
  } else {
    // Return to origin player as held
    const { error: returnError } = await db.from('game_player_promissory_notes')
      .update({ state: 'held', held_by_player_id: noteRow.origin_player_id })
      .eq('id', body.note_instance_id)
    if (returnError) return errorResponse('Database error', 500)
    return okResponse({ played: true })
  }

  const { error: updateError } = await db
    .from('game_player_promissory_notes')
    .update({ state: newState })
    .eq('id', body.note_instance_id)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ played: true })
}
if (typeof Deno !== 'undefined') Deno.serve(handler)
