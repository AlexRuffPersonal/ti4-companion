import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { axialRing, hexNeighbors } from '../_shared/draftHelpers.ts'

interface PlacedTile {
  tile_number: string
  rotation: number
  wormhole: string | null
  anomaly: string | null
}

interface DraftState {
  mode: string
  phase: string
  hands: Record<string, string[]>
  placement_order: string[]
  placement_index: number
  placed_tiles: Record<string, PlacedTile>
}

interface TileRow {
  id: string
  tile_number: string
  wormhole: string | null
  anomaly: string | null
}

// Mecatol Rex tile_number is '18'
const MECATOL_TILE_NUMBER = '18'

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
    tile_number?: unknown
    position?: unknown
    rotation?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.tile_number || typeof body.tile_number !== 'string') return errorResponse("'tile_number' is required")
  if (!body.position || typeof body.position !== 'string') return errorResponse("'position' is required")

  const gameId = body.game_id
  const tileNumber = body.tile_number
  const position = body.position
  const rotation = typeof body.rotation === 'number' ? body.rotation : 0

  // Fetch game
  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, draft_state')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const ds = (game as Record<string, unknown>).draft_state as DraftState | null
  if (!ds || ds.phase !== 'placement') return errorResponse('Draft is not in placement phase', 409)

  // Fetch player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const playerId = (player as Record<string, string>).id

  // Check it's this player's turn to place
  if (playerId !== ds.placement_order[ds.placement_index]) {
    return errorResponse('Not your turn to place', 403)
  }

  // Validate hand
  const hand = ds.hands[playerId] ?? []
  if (!hand.includes(tileNumber)) return errorResponse('Tile not in your hand', 400)

  // Validate position
  if (ds.placed_tiles[position]) return errorResponse('Position already occupied', 400)
  if (position === '0,0') return errorResponse('Cannot place on Mecatol (0,0)', 400)

  const parts = position.split(',')
  const q = parseInt(parts[0], 10)
  const r = parseInt(parts[1], 10)
  if (isNaN(q) || isNaN(r)) return errorResponse('Invalid position format', 400)

  // Ring constraint: can't skip rings
  const targetRing = axialRing(q, r)
  const placedKeys = Object.keys(ds.placed_tiles).filter((k) => k !== '0,0')
  let maxPlacedRing = 0
  for (const key of placedKeys) {
    const kp = key.split(',')
    const kq = parseInt(kp[0], 10)
    const kr = parseInt(kp[1], 10)
    if (!isNaN(kq) && !isNaN(kr)) {
      const ring = axialRing(kq, kr)
      if (ring > maxPlacedRing) maxPlacedRing = ring
    }
  }
  // Also count Mecatol as ring 0 placed
  if (targetRing > maxPlacedRing + 1) return errorResponse('Cannot skip rings when placing tiles', 400)

  // Fetch the tile being placed
  const { data: tileData, error: tileError } = await db
    .from('tiles')
    .select('id, tile_number, wormhole, anomaly')
    .eq('tile_number', tileNumber)
    .maybeSingle()
  if (tileError) return errorResponse('Database error', 500)
  if (!tileData) return errorResponse('Tile not found', 404)

  const tile = tileData as TileRow

  // Adjacency validation
  const neighbors = hexNeighbors(q, r)
  const warnings: string[] = []

  if (tile.anomaly) {
    const hasAnomalyNeighbor = neighbors.some(([nq, nr]) => {
      const nk = `${nq},${nr}`
      return ds.placed_tiles[nk]?.anomaly != null
    })
    if (hasAnomalyNeighbor) {
      if (hand.length > 1) {
        return errorResponse('Cannot place adjacent anomalies', 400)
      } else {
        warnings.push('Adjacent anomaly placement allowed (last tile)')
      }
    }
  }

  if (tile.wormhole) {
    const hasSameWormholeNeighbor = neighbors.some(([nq, nr]) => {
      const nk = `${nq},${nr}`
      return ds.placed_tiles[nk]?.wormhole === tile.wormhole
    })
    if (hasSameWormholeNeighbor) {
      if (hand.length > 1) {
        return errorResponse('Cannot place adjacent same-type wormholes', 400)
      } else {
        warnings.push('Adjacent wormhole placement allowed (last tile)')
      }
    }
  }

  // Apply placement
  const updatedHand = hand.filter((t) => t !== tileNumber)
  const updatedPlacedTiles: Record<string, PlacedTile> = {
    ...ds.placed_tiles,
    [position]: {
      tile_number: tileNumber,
      rotation,
      wormhole: tile.wormhole,
      anomaly: tile.anomaly,
    },
  }
  const newIndex = ds.placement_index + 1
  const isComplete = newIndex >= ds.placement_order.length

  if (isComplete) {
    // Build final map_tiles: resolve tile IDs for all placed tiles in bulk
    const allPlacedTileNumbers = Object.values(updatedPlacedTiles).map((pt) => pt.tile_number)
    allPlacedTileNumbers.push(MECATOL_TILE_NUMBER)

    const { data: allTilesData, error: allTilesError } = await db
      .from('tiles')
      .select('id, tile_number')
      .in('tile_number', allPlacedTileNumbers)
    if (allTilesError) return errorResponse('Database error', 500)

    const tileIdMap: Record<string, string> = {}
    for (const t of (allTilesData ?? []) as { id: string; tile_number: string }[]) {
      tileIdMap[t.tile_number] = t.id
    }

    const mapTiles: Record<string, unknown> = {
      '0,0': {
        tile_number: MECATOL_TILE_NUMBER,
        tile_id: tileIdMap[MECATOL_TILE_NUMBER] ?? null,
      },
    }
    for (const [coord, placed] of Object.entries(updatedPlacedTiles)) {
      mapTiles[coord] = {
        tile_number: placed.tile_number,
        tile_id: tileIdMap[placed.tile_number] ?? null,
        rotation: placed.rotation,
      }
    }

    const { error: updateError } = await db
      .from('games')
      .update({ draft_state: null, map_tiles: mapTiles })
      .eq('id', gameId)
    if (updateError) return errorResponse(`Failed to update game: ${updateError.message}`, 500)

    return okResponse({ complete: true, warnings })
  } else {
    const newDraftState: DraftState = {
      ...ds,
      hands: { ...ds.hands, [playerId]: updatedHand },
      placed_tiles: updatedPlacedTiles,
      placement_index: newIndex,
    }

    const { error: updateError } = await db
      .from('games')
      .update({ draft_state: newDraftState })
      .eq('id', gameId)
    if (updateError) return errorResponse(`Failed to update game: ${updateError.message}`, 500)

    return okResponse({
      complete: false,
      next_player: ds.placement_order[newIndex],
      warnings,
    })
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
