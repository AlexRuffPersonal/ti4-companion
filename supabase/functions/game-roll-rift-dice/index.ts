import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type Ship = { unit_id: string; roll: number | null; destroyed: boolean; cargo: { unit_id: string }[] }
type Transit = {
  id: string
  game_id: string
  player_id: string
  status: string
  ships: Ship[]
  system_key: string
  destination_key: string
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { transit_id?: unknown; roll_all?: unknown; unit_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.transit_id || typeof body.transit_id !== 'string') return errorResponse("'transit_id' is required")
  if (body.roll_all === undefined || body.roll_all === null) return errorResponse("'roll_all' is required")

  const { data: transit } = await db
    .from('game_rift_transits')
    .select('*')
    .eq('id', body.transit_id)
    .maybeSingle()
  if (!transit) return errorResponse('Transit not found', 404)

  const t = transit as Transit
  if (t.player_id !== userId) return errorResponse('Forbidden', 403)
  if (t.status !== 'pending') return errorResponse('Transit already complete', 409)

  // Mutable copy of ships
  const ships: Ship[] = t.ships.map(s => ({ ...s, cargo: s.cargo ? [...s.cargo] : [] }))

  if (body.roll_all) {
    for (const ship of ships) {
      if (ship.roll === null || ship.roll === undefined) {
        const roll = Math.floor(Math.random() * 10) + 1
        ship.roll = roll
        ship.destroyed = roll <= 3
      }
    }
  } else {
    if (!body.unit_id || typeof body.unit_id !== 'string') return errorResponse("'unit_id' is required", 400)
    const ship = ships.find(s => s.unit_id === body.unit_id)
    if (!ship) return errorResponse('Ship not found in transit', 404)
    if (ship.roll !== null && ship.roll !== undefined) return errorResponse('Ship already rolled', 409)
    const roll = Math.floor(Math.random() * 10) + 1
    ship.roll = roll
    ship.destroyed = roll <= 3
  }

  // Update transit ships in DB
  await db.from('game_rift_transits').update({ ships }).eq('id', body.transit_id)

  // Check if all ships have rolled
  const allRolled = ships.every(s => s.roll !== null && s.roll !== undefined)

  if (!allRolled) {
    return okResponse({ complete: false, ships })
  }

  // All ships have rolled — resolve
  const destroyedIds = ships
    .filter(s => s.destroyed)
    .flatMap(s => [s.unit_id, ...(s.cargo ?? []).map((c: { unit_id: string }) => c.unit_id)])

  if (destroyedIds.length > 0) {
    await db.from('game_player_units').delete().in('id', destroyedIds)
  }

  // Check for next pending transit
  const { data: nextTransit } = await db
    .from('game_rift_transits')
    .select('id')
    .eq('game_id', t.game_id)
    .eq('status', 'pending')
    .neq('id', body.transit_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Mark current transit complete
  await db.from('game_rift_transits').update({ status: 'complete' }).eq('id', body.transit_id)

  if (nextTransit) {
    return okResponse({ complete: false, next_transit_id: (nextTransit as Record<string, string>).id })
  }

  // Move surviving ships to destination
  const survivorIds = ships
    .filter(s => !s.destroyed)
    .map(s => s.unit_id)

  if (survivorIds.length > 0) {
    await db
      .from('game_player_units')
      .update({ system_key: t.destination_key })
      .in('id', survivorIds)
  }

  return okResponse({ complete: true, destroyed: destroyedIds })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
