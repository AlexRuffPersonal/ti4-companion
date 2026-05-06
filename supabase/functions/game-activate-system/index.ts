import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type UnitRow = { player_id: string; unit_type: string; count: number; system_key: string }
type ScDef = { name: string; space_cannon: string }
type TileRow = { id: string; wormhole: string | null }
type MapTileRef = { tile_id: string }

function parseDiceCount(text: string): number {
  const m = text.match(/\(x(\d+)\)/)
  return m ? parseInt(m[1]) : 1
}

function axialNeighbors(systemKey: string): string[] {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; system_key?: unknown; movement_payload?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, command_tokens')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, active_player_id, round, map_tiles')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not the active player', 409)

  const tokens = player.command_tokens as { tactic_total: number }
  const tacticTotal = tokens?.tactic_total ?? 0

  const { data: activations, error: activationError } = await db
    .from('game_system_activations')
    .select('id, system_key')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('round', game.round)
  if (activationError) return errorResponse('Database error', 500)

  if ((activations ?? []).length >= tacticTotal) return errorResponse('No tactic tokens available', 409)
  if ((activations ?? []).some((a: { system_key: string }) => a.system_key === body.system_key)) {
    return errorResponse('System already activated by you this round', 409)
  }

  // Build relevant system set: activated + axial neighbors + wormhole-connected
  const neighborKeys = axialNeighbors(body.system_key)
  const mapTiles = (game.map_tiles ?? {}) as Record<string, MapTileRef>
  const tileIds = Object.values(mapTiles).map((t) => t.tile_id)

  // Non-critical: if tiles query fails, fall back to no wormhole connections
  const { data: tilesData, error: _tilesError } = await db
    .from('tiles')
    .select('id, wormhole')
    .in('id', tileIds.length > 0 ? tileIds : ['__none__'])

  const sysWormholes: Record<string, string> = {}
  for (const [sk, ref] of Object.entries(mapTiles)) {
    const tile = (tilesData ?? []).find((t: TileRow) => t.id === ref.tile_id)
    if (tile?.wormhole) sysWormholes[sk] = tile.wormhole
  }
  const activatedWh = sysWormholes[body.system_key]
  const whConnected: string[] = activatedWh
    ? Object.entries(sysWormholes)
        .filter(([sk, wh]) => sk !== body.system_key && wh === activatedWh)
        .map(([sk]) => sk)
    : []

  const relevantSystems = [body.system_key, ...neighborKeys, ...whConnected]

  // Single fetch: all space units for this game; derive enemy detection and space-cannon sets from it
  // Non-critical: if units query fails, fall back to treating game as having no space units
  const { data: allSpaceUnits, error: _unitsError } = await db
    .from('game_player_units')
    .select('player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .is('on_planet', null)

  const enemyUnits = (allSpaceUnits ?? []).filter(
    (u: UnitRow) => u.system_key === body.system_key && u.player_id !== player.id
  )

  let combatId: string | null = null

  if (enemyUnits.length > 0) {
    const defenderPlayerId = enemyUnits[0].player_id

    const relevantUnits = (allSpaceUnits ?? []).filter((u: UnitRow) =>
      relevantSystems.includes(u.system_key)
    )

    // Get space cannon unit definitions
    const { data: scDefs } = await db
      .from('units')
      .select('name, space_cannon')
      .not('space_cannon', 'is', null)

    const scMap = new Map((scDefs ?? []).map((u: ScDef) => [u.name, u.space_cannon]))

    // Build space_cannon_pending
    type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
    const spPending: SpEntry[] = []
    const seen = new Set<string>()

    for (const unit of relevantUnits) {
      if (!scMap.has(unit.unit_type)) continue
      const key = `${unit.player_id}:${unit.system_key}`
      if (seen.has(key)) continue
      seen.add(key)
      spPending.push({
        player_id: unit.player_id,
        system_key: unit.system_key,
        unit_type: unit.unit_type,
        dice_count: parseDiceCount(scMap.get(unit.unit_type)!),
        resolved: false,
      })
    }

    const shipsMovedIn = (body.movement_payload as Array<{ origin_system_key?: string }> ?? []).some(
      (ship) => ship.origin_system_key !== body.system_key
    )

    const { data: combatRows, error: combatInsertError } = await db
      .from('game_combats')
      .insert({
        game_id: body.game_id,
        system_key: body.system_key,
        attacker_player_id: player.id,
        defender_player_id: defenderPlayerId,
        phase: 'window_pre_space_cannon',
        space_cannon_pending: spPending,
        ships_moved_in: shipsMovedIn,
      })
      .select('id')
    if (combatInsertError) return errorResponse(`Failed to create combat: ${combatInsertError.message}`, 500)
    combatId = combatRows?.[0]?.id ?? null
  }

  const { error: insertError } = await db
    .from('game_system_activations')
    .insert({
      game_id: body.game_id,
      player_id: player.id,
      system_key: body.system_key,
      round: game.round,
      token_owner_id: player.id,
    })
  if (insertError) return errorResponse(`Failed to activate system: ${insertError.message}`, 500)

  return okResponse({ activated: true, combat_id: combatId })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
