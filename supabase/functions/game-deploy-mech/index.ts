import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_DEPLOY_MECH } from '../_shared/gameEvents.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_id?: unknown
    unit_id?: unknown
    system_key?: unknown
    target_planet_name?: unknown
    replacing_infantry?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.unit_id || typeof body.unit_id !== 'string') return errorResponse("'unit_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!body.target_planet_name || typeof body.target_planet_name !== 'string') return errorResponse("'target_planet_name' is required")

  // 1. Find the activating player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // 2. Fetch the unit definition
  const { data: unit, error: unitError } = await db
    .from('units')
    .select('id, unit_type, faction')
    .eq('id', body.unit_id)
    .maybeSingle()
  if (unitError) return errorResponse('Database error', 500)
  if (!unit) return errorResponse('Unit not found', 404)

  const u = unit as Record<string, string>

  // 3. Validate unit is a mech
  if (u.unit_type !== 'mech') return errorResponse('Unit is not a mech', 409)

  // 4. Validate faction ownership
  const p = player as Record<string, string>
  if (u.faction !== p.faction) return errorResponse('Faction mismatch: unit does not belong to your faction', 409)

  // 5. Verify player controls the target planet
  const { data: planetRow, error: planetError } = await db
    .from('game_player_planets')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', p.id)
    .eq('planet_name', body.target_planet_name)
    .maybeSingle()
  if (planetError) return errorResponse('Database error', 500)
  if (!planetRow) return errorResponse('Planet not controlled by player', 409)

  // 6. Upsert mech unit into game_player_units
  const { data: existingMech } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', body.game_id)
    .eq('player_id', p.id)
    .eq('system_key', body.system_key)
    .eq('unit_type', 'mech')
    .eq('on_planet', body.target_planet_name)
    .maybeSingle()

  if (existingMech) {
    const em = existingMech as { id: string; count: number }
    const { error: updateError } = await db
      .from('game_player_units')
      .update({ count: em.count + 1 })
      .eq('id', em.id)
    if (updateError) return errorResponse(`Failed to update units: ${updateError.message}`, 500)
  } else {
    const { error: insertError } = await db
      .from('game_player_units')
      .insert({
        game_id: body.game_id,
        player_id: p.id,
        system_key: body.system_key,
        unit_type: 'mech',
        count: 1,
        on_planet: body.target_planet_name,
      })
    if (insertError) return errorResponse(`Failed to deploy mech: ${insertError.message}`, 500)
  }

  // 7. Optionally replace infantry
  if (body.replacing_infantry === true) {
    const { data: infantryRow } = await db
      .from('game_player_units')
      .select('id, count')
      .eq('game_id', body.game_id)
      .eq('player_id', p.id)
      .eq('system_key', body.system_key)
      .eq('unit_type', 'infantry')
      .eq('on_planet', body.target_planet_name)
      .maybeSingle()

    if (infantryRow) {
      const inf = infantryRow as { id: string; count: number }
      if (inf.count <= 1) {
        await db.from('game_player_units').delete().eq('id', inf.id)
      } else {
        await db.from('game_player_units').update({ count: inf.count - 1 }).eq('id', inf.id)
      }
    }
  }

  // 8. Log event
  const { data: game } = await db.from('games').select('round').eq('id', body.game_id).maybeSingle()
  const round = (game as Record<string, number> | null)?.round ?? 0

  await logEvent(db, {
    game_id: body.game_id,
    player_id: p.id,
    event_type: EVT_DEPLOY_MECH,
    payload: {
      unit_id: body.unit_id,
      system_key: body.system_key,
      target_planet_name: body.target_planet_name,
      replacing_infantry: body.replacing_infantry ?? false,
    },
    round,
    phase: 'action',
  })

  return okResponse({ deployed: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
