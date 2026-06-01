import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { checkAndEliminate } from '../_shared/eliminationHandler.ts'
import { logEvent, EVT_LAND_TROOPS } from '../_shared/gameEvents.ts'
import { assertMovementAllowed, checkVpMaintenanceLaws, LawError } from '../_shared/lawEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; system_key?: unknown; planet_name?: unknown; troop_count?: unknown; unit_type?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!body.planet_name || typeof body.planet_name !== 'string') return errorResponse("'planet_name' is required")
  if (typeof body.troop_count !== 'number' || body.troop_count < 1) return errorResponse("'troop_count' must be >= 1")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('round, map_tiles, custodians_claimed')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const { data: activation, error: activationError } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('system_key', body.system_key)
    .eq('round', game.round)
    .maybeSingle()
  if (activationError) return errorResponse('Database error', 500)
  if (!activation) return errorResponse('System not activated by you this round', 409)

  const mapTiles = game.map_tiles as Record<string, { tile_id: string; tile_number: string }> | null
  const tileEntry = mapTiles?.[body.system_key]
  if (!tileEntry) return errorResponse('System not found in map', 409)

  const { data: tile, error: tileError } = await db
    .from('tiles')
    .select('planets')
    .eq('id', tileEntry.tile_id)
    .maybeSingle()
  if (tileError) return errorResponse('Database error', 500)
  if (!tile) return errorResponse('Tile not found', 404)

  const planets = (tile.planets ?? []) as Array<{ name: string }>
  const planetExists = planets.some(p => p.name === body.planet_name)
  if (!planetExists) return errorResponse(`Planet "${body.planet_name}" not found in system`, 409)

  const { data: existingOwner, error: ownerError } = await db
    .from('game_player_planets')
    .select('player_id')
    .eq('game_id', body.game_id)
    .eq('planet_name', body.planet_name)
    .maybeSingle()
  if (ownerError) return errorResponse('Database error', 500)
  const previousOwnerId = (existingOwner as { player_id: string } | null)?.player_id ?? null

  try {
    await assertMovementAllowed(db, body.game_id as string, body.planet_name as string)
  } catch (err) {
    if (err instanceof LawError) return errorResponse(err.message, 409)
    throw err
  }

  const { error: planetError2 } = await db
    .from('game_player_planets')
    .upsert({
      game_id: body.game_id,
      player_id: player.id,
      planet_name: body.planet_name,
      tile_id: tileEntry.tile_id,
      exhausted: true,
    }, { onConflict: 'game_id,planet_name' })
  if (planetError2) return errorResponse(`Failed to claim planet: ${planetError2.message}`, 500)

  // DMZ check: mechs cannot be placed on a Demilitarized Zone planet
  if (body.unit_type === 'mech') {
    const { data: planetRow } = await db
      .from('game_player_planets')
      .select('attachments')
      .eq('game_id', body.game_id)
      .eq('player_id', player.id)
      .eq('planet_name', body.planet_name)
      .maybeSingle()
    const planetAttachments = ((planetRow as { attachments?: string[] } | null)?.attachments ?? []) as string[]
    if (planetAttachments.length > 0) {
      const { data: attachmentRows } = await db
        .from('attachments')
        .select('name')
        .in('id', planetAttachments)
      const attachmentNames = (attachmentRows ?? []).map((a: { name: string }) => a.name)
      if (attachmentNames.includes('Demilitarized Zone')) {
        return errorResponse('Cannot place a mech on a Demilitarized Zone planet', 409)
      }
    }
  }

  if (previousOwnerId !== null && previousOwnerId !== player.id) {
    try {
      await checkVpMaintenanceLaws(db, body.game_id as string, previousOwnerId, body.planet_name as string)
    } catch (err) {
      if (err instanceof LawError) return errorResponse(err.message, 409)
      return errorResponse('Failed to apply VP maintenance law', 500)
    }
  }

  const { data: existingUnit } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('system_key', body.system_key)
    .eq('unit_type', 'infantry')
    .eq('on_planet', body.planet_name)
    .maybeSingle()

  if (existingUnit) {
    const { error: updateUnitError } = await db
      .from('game_player_units')
      .update({ count: (existingUnit as { id: string; count: number }).count + (body.troop_count as number) })
      .eq('id', (existingUnit as { id: string; count: number }).id)
    if (updateUnitError) return errorResponse(`Failed to update units: ${updateUnitError.message}`, 500)
  } else {
    const { error: insertUnitError } = await db
      .from('game_player_units')
      .insert({
        game_id: body.game_id,
        player_id: player.id,
        system_key: body.system_key,
        unit_type: 'infantry',
        count: body.troop_count,
        on_planet: body.planet_name,
      })
    if (insertUnitError) return errorResponse(`Failed to add units: ${insertUnitError.message}`, 500)
  }

  let custodiansAwarded = false
  if (body.system_key === '0,0' && !game.custodians_claimed) {
    const { error: custError } = await db
      .from('games')
      .update({ custodians_claimed: true, agenda_unlocked: true })
      .eq('id', body.game_id)
    if (custError) return errorResponse(`Failed to update custodians: ${custError.message}`, 500)

    const { data: playerFull } = await db
      .from('game_players')
      .select('vp')
      .eq('id', player.id)
      .maybeSingle()

    const { error: vpError } = await db
      .from('game_players')
      .update({ vp: ((playerFull as { vp: number } | null)?.vp ?? 0) + 1 })
      .eq('id', player.id)
    if (vpError) return errorResponse(`Failed to award VP: ${vpError.message}`, 500)

    custodiansAwarded = true
  }

  const eliminatedPlayerIds = await checkAndEliminate(db, body.game_id as string)
  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_LAND_TROOPS,
    payload: { player_id: player.id, system_key: body.system_key, planet_name: body.planet_name, units: body.troop_count },
    round: game.round,
    phase: 'action',
  })
  return okResponse({ claimed: true, ...(custodiansAwarded && { custodians_claimed: true }), eliminatedPlayerIds })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)