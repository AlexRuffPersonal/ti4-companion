import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_PLAY_PROMISSORY_NOTE } from '../_shared/gameEvents.ts'
import { interpretEffects, type ResolveContext } from '../_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../_shared/promissoryHandlers.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }
  let body: { game_id?: unknown; note_instance_id?: unknown; selections?: Record<string, unknown>; planet_name?: unknown }
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

  const { data: game, error: gameError } = await db
    .from('games')
    .select('round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: noteRow, error: noteRowError } = await db
    .from('game_player_promissory_notes')
    .select('id, state, held_by_player_id, note_id, origin_player_id')
    .eq('id', body.note_instance_id)
    .maybeSingle()
  if (noteRowError) return errorResponse('Database error', 500)
  if (!noteRow) return errorResponse('Note not found', 404)

  if (noteRow.held_by_player_id !== player.id) return errorResponse('You do not hold this note', 403)
  if (noteRow.state !== 'held') return errorResponse('Note is not held', 409)

  const { data: abilitySource, error: abilitySourceError } = await db
    .from('ability_sources')
    .select('ability_definition_id, ability_definitions(id, handler_key, effects)')
    .eq('source_type', 'promissory_note')
    .eq('source_id', noteRow.note_id)
    .maybeSingle()

  if (abilitySourceError) return errorResponse('Database error', 500)
  if (!abilitySource) return errorResponse('No ability definition for this note', 404)

  const abilityDef = abilitySource.ability_definitions as { id: string; handler_key: string | null; effects: unknown[] } | null
  const effects = abilityDef?.effects ?? []
  const handlerKey = abilityDef?.handler_key ?? null
  const selections = (body.selections ?? {}) as Record<string, unknown>

  const ctx: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: player.id,
    noteInstanceId: body.note_instance_id,
    noteOriginPlayerId: noteRow.origin_player_id,
    selections,
  }

  try {
    if (effects.length > 0) {
      await interpretEffects(effects, ctx, db)
    } else if (handlerKey) {
      await resolvePromissoryHandler(handlerKey, ctx, db)
    }
  } catch (err: unknown) {
    const e = err as Error & { status?: number }
    const status = e.status === 501 ? 501 : e.status === 409 ? 409 : 500
    return errorResponse(e.message ?? 'Internal server error', status)
  }

  const { data: noteRefData, error: noteRefError } = await db
    .from('promissory_notes')
    .select('purge_on_use, into_play_area')
    .eq('id', noteRow.note_id)
    .maybeSingle()
  if (noteRefError) return errorResponse('Database error', 500)

  if (noteRefData?.name === 'Terraform') {
    const planetName = body.planet_name
    if (!planetName || typeof planetName !== 'string') return errorResponse("'planet_name' is required", 400)
    if (planetName === 'Mecatol Rex') return errorResponse('Cannot attach Terraform to home planet or Mecatol Rex', 409)

    const { data: planetRow } = await db
      .from('game_player_planets')
      .select('id, attachments, tiles(type)')
      .eq('game_id', body.game_id)
      .eq('player_id', player.id)
      .eq('name', planetName)
      .maybeSingle()

    if (!planetRow) return errorResponse('Planet not controlled by player', 409)

    if ((planetRow as Record<string, unknown> & { tiles?: { type?: string } }).tiles?.type === 'faction') {
      return errorResponse('Cannot attach Terraform to home planet or Mecatol Rex', 409)
    }

    const { data: attachmentRow } = await db
      .from('attachments')
      .select('id')
      .eq('name', 'Terraform')
      .maybeSingle()

    const existingAttachments = ((planetRow as Record<string, unknown>).attachments ?? []) as string[]
    if (attachmentRow && existingAttachments.includes((attachmentRow as Record<string, string>).id)) {
      return errorResponse('Already attached', 409)
    }

    const newAttachments = [...existingAttachments, ...((attachmentRow as Record<string, string> | null)?.id ? [(attachmentRow as Record<string, string>).id] : [])]
    await db.from('game_player_planets').update({ attachments: newAttachments }).eq('id', (planetRow as Record<string, unknown>).id)
  }

  let updateFields: Record<string, unknown>
  if (noteRefData?.into_play_area) {
    // Keep held_by_player_id unchanged; just mark in_play
    updateFields = { state: 'in_play' }
  } else if (noteRefData?.purge_on_use) {
    updateFields = { state: 'discarded' }
  } else {
    // Return to origin player as held
    updateFields = { state: 'held', held_by_player_id: noteRow.origin_player_id }
  }

  const { error: updateError } = await db
    .from('game_player_promissory_notes')
    .update(updateFields)
    .eq('id', body.note_instance_id)
  if (updateError) return errorResponse('Database error', 500)

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_PLAY_PROMISSORY_NOTE,
    payload: { player_id: player.id, note_id: body.note_instance_id, target_player_id: noteRow.origin_player_id },
    round: game.round,
    phase: 'action',
  })
  return okResponse({ played: true })
}
if (typeof Deno !== 'undefined') Deno.serve(handler)
