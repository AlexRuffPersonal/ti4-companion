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

  let body: { game_id?: unknown; combat_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  if (combat.phase !== 'barrage') {
    return errorResponse('Combat is not in barrage phase', 409)
  }

  if ((player as Record<string, string>).id !== combat.attacker_player_id) {
    return errorResponse('Only the attacker can advance barrage', 409)
  }

  // If barrage has not been fired yet, check for AFB units
  if (combat.barrage_attacker_dice === null || combat.barrage_attacker_dice === undefined) {
    const { data: attackerUnits } = await db
      .from('game_player_units')
      .select('unit_type')
      .eq('game_id', body.game_id)
      .eq('system_key', combat.system_key)
      .eq('player_id', combat.attacker_player_id)
      .is('on_planet', null)

    const unitTypes = [...new Set((attackerUnits ?? []).map((u: { unit_type: string }) => u.unit_type))]

    const { data: afbDefs } = await db
      .from('units')
      .select('name')
      .in('name', unitTypes.length > 0 ? unitTypes : ['__none__'])
      .not('afb', 'is', null)

    if ((afbDefs ?? []).length > 0) {
      return errorResponse('Must fire Anti-Fighter Barrage before advancing', 409)
    }
  }

  await db.from('game_combats').update({ phase: 'attacker_roll' }).eq('id', body.combat_id)

  return okResponse({ phase: 'attacker_roll' })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
