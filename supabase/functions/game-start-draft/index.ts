import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { shuffle, scoreTile, buildSnakeOrder } from '../_shared/draftHelpers.ts'

// Tiles dealt per player count: { b: blue, r: red, sb: speaker bonus blue, sr: speaker bonus red }
const DEALT: Record<number, { b: number; r: number; sb?: number; sr?: number }> = {
  3: { b: 6, r: 2 },
  4: { b: 5, r: 3 },
  5: { b: 4, r: 2, sr: 1 },
  6: { b: 3, r: 2 },
  7: { b: 4, r: 2, sb: 3, sr: 2 },
  8: { b: 4, r: 2, sb: 2, sr: 2 },
}

interface TileRow {
  id: string
  tile_number: string
  type: string
  expansion: string
  planets: { resources: number; influence: number }[]
  anomaly: string | null
  wormhole: string | null
}

interface PlayerRow {
  id: string
  user_id: string
  seat_index: number
}

/**
 * Balance milty slices: build N slices each of `countB` blue + `countR` red tiles.
 * Greedy algorithm: sort tiles by score desc, assign each to lowest-score slice.
 * Retry up to 50 times until max_score - min_score <= 2.
 */
function balanceSlices(
  blueTiles: TileRow[],
  redTiles: TileRow[],
  n: number,
  countB: number,
  countR: number,
): { id: string; tiles: string[]; score: number; claimed_by: string | null }[] {
  const needed = n * (countB + countR)
  const totalBlue = n * countB
  const totalRed = n * countR

  for (let attempt = 0; attempt < 50; attempt++) {
    const shuffledBlue = shuffle(blueTiles).slice(0, totalBlue)
    const shuffledRed = shuffle(redTiles).slice(0, totalRed)

    // Score each tile
    const scoredBlue = shuffledBlue.map((t) => ({ t, score: scoreTile(t) }))
    const scoredRed = shuffledRed.map((t) => ({ t, score: scoreTile(t) }))

    // Combine and sort descending by score
    const all = [...scoredBlue, ...scoredRed].sort((a, b) => b.score - a.score)

    // Initialize slices
    const slices: { tiles: TileRow[]; score: number }[] = Array.from({ length: n }, () => ({
      tiles: [],
      score: 0,
    }))

    // Greedy assignment
    for (const { t, score } of all) {
      // Find slice with lowest score that isn't full
      let targetIdx = -1
      let minScore = Infinity
      for (let i = 0; i < n; i++) {
        const s = slices[i]
        const maxBlue = countB
        const maxRed = countR
        const blueCount = s.tiles.filter((x) => x.type === 'blue').length
        const redCount = s.tiles.filter((x) => x.type === 'red').length
        const isFull =
          (t.type === 'blue' && blueCount >= maxBlue) ||
          (t.type === 'red' && redCount >= maxRed)
        if (!isFull && s.score < minScore) {
          minScore = s.score
          targetIdx = i
        }
      }
      if (targetIdx === -1) continue
      slices[targetIdx].tiles.push(t)
      slices[targetIdx].score += score
    }

    const scores = slices.map((s) => s.score)
    const maxScore = Math.max(...scores)
    const minScore = Math.min(...scores)

    if (maxScore - minScore <= 2 || attempt === 49) {
      return slices.map((s, i) => ({
        id: `slice-${i}`,
        tiles: s.tiles.map((t) => t.tile_number),
        score: s.score,
        claimed_by: null,
      }))
    }
  }

  // Fallback (should not reach)
  return []
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

  let body: { game_id?: unknown; mode?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.mode || typeof body.mode !== 'string') return errorResponse("'mode' is required")
  if (body.mode !== 'official' && body.mode !== 'milty') return errorResponse("'mode' must be 'official' or 'milty'")

  const gameId = body.game_id
  const mode = body.mode as 'official' | 'milty'

  // Fetch game
  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, status, host_user_id, expansions, speaker, draft_state')
    .eq('id', gameId)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const g = game as Record<string, unknown>

  // Auth checks
  if (g.host_user_id !== userId) return errorResponse('Forbidden: only the host can start a draft', 403)
  if (g.status !== 'lobby') return errorResponse('Game is not in lobby phase', 409)
  if (g.draft_state !== null) return errorResponse('Draft already active', 409)

  // Fetch players
  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, user_id, seat_index')
    .eq('game_id', gameId)
    .order('seat_index')
  if (playersError) return errorResponse('Database error', 500)
  if (!players || players.length < 3) return errorResponse('Need at least 3 players to start a draft', 409)

  const playerList = players as PlayerRow[]
  const N = playerList.length

  // Fetch tiles
  const expansions = (g.expansions as Record<string, boolean>) ?? {}
  let tileQuery = db.from('tiles').select('id, tile_number, type, expansion, planets, anomaly, wormhole')
    .in('type', ['blue', 'red'])
  if (!expansions.pok) {
    tileQuery = tileQuery.eq('expansion', 'base')
  }
  const { data: tilesData, error: tilesError } = await tileQuery
  if (tilesError) return errorResponse('Database error', 500)

  const tiles = (tilesData ?? []) as TileRow[]
  const blueTiles = tiles.filter((t) => t.type === 'blue')
  const redTiles = tiles.filter((t) => t.type === 'red')

  // Get counts for this player count
  const counts = DEALT[N] ?? DEALT[6]

  // Rotate players so speaker is first
  const speakerId = g.speaker as string
  const speakerIndex = playerList.findIndex((p) => p.id === speakerId)
  const rotated = speakerIndex >= 0
    ? [...playerList.slice(speakerIndex), ...playerList.slice(0, speakerIndex)]
    : playerList

  let draftState: Record<string, unknown>

  if (mode === 'official') {
    const shuffledBlue = shuffle(blueTiles)
    const shuffledRed = shuffle(redTiles)
    let blueIdx = 0
    let redIdx = 0

    const hands: Record<string, string[]> = {}
    const handSizes: Record<string, number> = {}

    for (let i = 0; i < rotated.length; i++) {
      const player = rotated[i]
      const isSpeaker = player.id === speakerId
      const b = counts.b + (isSpeaker ? (counts.sb ?? 0) : 0)
      const r = counts.r + (isSpeaker ? (counts.sr ?? 0) : 0)
      const hand: string[] = []
      for (let j = 0; j < b && blueIdx < shuffledBlue.length; j++, blueIdx++) {
        hand.push(shuffledBlue[blueIdx].tile_number)
      }
      for (let j = 0; j < r && redIdx < shuffledRed.length; j++, redIdx++) {
        hand.push(shuffledRed[redIdx].tile_number)
      }
      hands[player.id] = hand
      handSizes[player.id] = hand.length
    }

    const orderedIds = rotated.map((p) => p.id)
    const placementOrder = buildSnakeOrder(orderedIds, handSizes)

    draftState = {
      mode: 'official',
      phase: 'placement',
      hands,
      placement_order: placementOrder,
      placement_index: 0,
      placed_tiles: {},
    }
  } else {
    // milty
    const slices = balanceSlices(blueTiles, redTiles, N, counts.b, counts.r)
    // pick_order is reverse-speaker order
    const pickOrder = [...rotated].reverse().map((p) => p.id)

    draftState = {
      mode: 'milty',
      phase: 'slice-pick',
      slices,
      pick_order: pickOrder,
      pick_index: 0,
      hands: {},
      placement_order: [],
      placement_index: 0,
      placed_tiles: {},
    }
  }

  const { error: updateError } = await db
    .from('games')
    .update({ draft_state: draftState })
    .eq('id', gameId)
  if (updateError) return errorResponse(`Failed to update game: ${updateError.message}`, 500)

  return okResponse({ mode, phase: draftState.phase, player_count: N })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
