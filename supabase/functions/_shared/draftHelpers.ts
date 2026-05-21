/**
 * Shuffle an array using Fisher-Yates algorithm.
 * Returns a new shuffled copy (does not mutate the input).
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Score a tile for balance purposes:
 * sum(planet.resources + planet.influence) + (wormhole ? 1 : 0) - (anomaly ? 1 : 0)
 */
export function scoreTile(tile: {
  planets: { resources: number; influence: number }[]
  wormhole: string | null
  anomaly: string | null
}): number {
  let score = 0
  for (const planet of tile.planets) {
    score += planet.resources + planet.influence
  }
  if (tile.wormhole) score += 1
  if (tile.anomaly) score -= 1
  return score
}

/**
 * Build full snake placement order given ordered player IDs and per-player hand sizes.
 * Pattern: [p0,p1,...,pN-1,pN-1,...,p1,p0] repeating until all tiles are assigned.
 * Skips a player once their hand is exhausted.
 */
export function buildSnakeOrder(
  playerIds: string[],
  handSizes: Record<string, number>,
): string[] {
  // Track remaining tiles per player
  const remaining: Record<string, number> = {}
  let totalTiles = 0
  for (const pid of playerIds) {
    remaining[pid] = handSizes[pid] ?? 0
    totalTiles += remaining[pid]
  }

  const order: string[] = []
  let goingForward = true

  while (order.length < totalTiles) {
    const snapshot = goingForward ? [...playerIds] : [...playerIds].reverse()
    let addedInPass = false
    for (const pid of snapshot) {
      if (remaining[pid] > 0) {
        order.push(pid)
        remaining[pid]--
        addedInPass = true
      }
    }
    if (!addedInPass) break
    goingForward = !goingForward
  }

  return order
}

/**
 * Chebyshev ring distance from Mecatol (0,0) in axial coordinates.
 * ring = max(|q|, |r|, |q+r|)
 */
export function axialRing(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
}

/**
 * Six axial neighbors of (q, r).
 */
export function hexNeighbors(q: number, r: number): [number, number][] {
  return [
    [q + 1, r],
    [q - 1, r],
    [q, r + 1],
    [q, r - 1],
    [q + 1, r - 1],
    [q - 1, r + 1],
  ]
}
