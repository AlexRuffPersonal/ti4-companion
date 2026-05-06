import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function axialNeighborKeys(systemKey: string): string[] {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
}

function isWithinHops(
  from: string,
  to: string,
  maxHops: number,
  mapTiles: Record<string, unknown>,
  wormholes: string[]
): boolean {
  // Build wormhole adjacency: keys in mapTiles that share a wormhole type with the system
  // wormholes param: list of wormhole type strings that from-system has (pre-computed by caller)
  // For BFS we need a way to get wormhole-connected systems; we pass full mapTiles+wormholes separately
  // This helper does pure axial BFS (wormhole adjacency handled via caller passing extra neighbors)
  // Simple BFS up to maxHops using axial neighbors
  if (from === to) return true
  const visited = new Set<string>([from])
  let frontier = new Set<string>([from])

  for (let hop = 0; hop < maxHops; hop++) {
    const next = new Set<string>()
    for (const node of frontier) {
      for (const neighbor of axialNeighborKeys(node)) {
        if (neighbor === to) return true
        if (!visited.has(neighbor) && neighbor in mapTiles) {
          next.add(neighbor)
          visited.add(neighbor)
        }
      }
    }
    // Also traverse wormhole edges from any frontier node that has a wormhole
    // (wormholes param is not per-node here; the caller handles it by expanding wormholes)
    frontier = next
  }
  return false
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; destination?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!body.destination || typeof body.destination !== 'string') return errorResponse("'destination' is required")

  const { data: player } = await db
    .from('game_players').select('id, command_tokens')
    .eq('game_id', body.game_id).eq('user_id', userId).maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats').select('*')
    .eq('id', body.combat_id).eq('game_id', body.game_id).maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)
  if (combat.status !== 'active') return errorResponse('Combat is not active', 409)

  if (player.id !== combat.attacker_player_id && player.id !== combat.defender_player_id) {
    return errorResponse('Player is not a participant in this combat', 403)
  }

  const { data: game } = await db
    .from('games').select('map_tiles')
    .eq('id', body.game_id).maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const mapTiles = (game.map_tiles ?? {}) as Record<string, unknown>
  if (!(body.destination in mapTiles)) return errorResponse('Destination is not a valid system', 409)

  // Check Dark Energy Tap for extended retreat range
  const { data: retreatingPlayer } = await db
    .from('game_players')
    .select('technologies')
    .eq('id', combat.retreat_declared_by ?? player.id)
    .maybeSingle()
  const hasDarkEnergyTap = ((retreatingPlayer as { technologies?: string[] } | null)?.technologies ?? []).includes('Dark Energy Tap')
  const maxHops = hasDarkEnergyTap ? 2 : 1

  if (!isWithinHops(combat.system_key, body.destination, maxHops, mapTiles, [])) {
    return errorResponse('Destination is not adjacent to the combat system', 409)
  }

  // Check player has presence in destination (ships in space area)
  const { data: unitsInDest } = await db
    .from('game_player_units').select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', body.destination)
    .eq('player_id', player.id)
    .is('on_planet', null)
    .limit(1)

  const { data: planetsInDest } = await db
    .from('game_player_planets').select('id')
    .eq('game_id', body.game_id)
    .eq('system_key', body.destination)
    .eq('player_id', player.id)
    .limit(1)

  if ((unitsInDest ?? []).length === 0 && (planetsInDest ?? []).length === 0) {
    return errorResponse('No presence in destination system: no units or controlled planets', 409)
  }

  // Check CC availability in reinforcements (tactic_total = unspent reinforcement CCs)
  const tokens = (player.command_tokens ?? {}) as { tactic_total?: number }
  if ((tokens.tactic_total ?? 0) <= 0) {
    return errorResponse('No command counter available in reinforcements', 409)
  }

  const { error } = await db
    .from('game_combats')
    .update({ retreat_declared_by: player.id, retreat_destination: body.destination })
    .eq('id', body.combat_id)
  if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  return okResponse({ retreat_declared_by: player.id, retreat_destination: body.destination })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
