# lib-mapParser

**File:** `src/lib/mapParser.js`
**Status:** New
**Prereqs:** —

## Functionality

```js
// Spiral non-home axial positions in Milty order for each player count (3–8).
// Index 0 = first token in the map string (ring 1, position 1).
// Mecatol '0,0' and home positions are NOT included.
export const SPIRAL_NON_HOME_POSITIONS = {
  3: [...],  // 33 entries
  4: [...],  // 32 entries
  5: [...],  // 31 entries
  6: [...],  // 30 entries — matches current INNER_POSITIONS[1..30] in game-start
  7: [...],  // 33 entries (includes 4 ring-4 positions)
  8: [...],  // 36 entries (includes 8 ring-4 positions)
}

// Home slot positions per player count, in seat order (seat 0 → index 0).
// Consumed by game-start to place faction home tiles.
export const HOME_POSITIONS_BY_COUNT = {
  3: ['3,-3', '-3,3', '0,-3'],
  4: ['3,-3', '3,0', '-3,3', '0,-3'],
  5: ['3,-3', '3,0', '0,3', '-3,3', '0,-3'],
  6: ['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3'],  // current hardcoded
  7: [...],  // 7 home positions using ring-4 slots
  8: [...],  // 8 home positions using ring-4 slots
}

// Recommended maps from base game and PoK rulebooks.
export const PRESET_MAPS = [
  { id: 'base-recommended-3', name: '3P Recommended (Base)', playerCount: 3, mapString: '...', requiresPok: false },
  { id: 'base-recommended-4', name: '4P Recommended (Base)', playerCount: 4, mapString: '...', requiresPok: false },
  { id: 'base-recommended-5', name: '5P Recommended (Base)', playerCount: 5, mapString: '...', requiresPok: false },
  { id: 'base-recommended-6', name: '6P Recommended (Base)', playerCount: 6, mapString: '...', requiresPok: false },
  { id: 'base-recommended-7', name: '7P Recommended (Base)', playerCount: 7, mapString: '...', requiresPok: false },
  { id: 'base-recommended-8', name: '8P Recommended (Base)', playerCount: 8, mapString: '...', requiresPok: false },
  { id: 'pok-recommended-6', name: '6P Recommended (PoK)', playerCount: 6, mapString: '...', requiresPok: true },
  { id: 'pok-hyperlane-6', name: '6P Hyperlane (PoK)', playerCount: 6, mapString: '...', requiresPok: true },
  // additional PoK variants per rulebook
]

/**
 * Parse a Milty-format map string for the given player count.
 * @returns {{ tiles: Record<string, { tile_number: string, rotation?: number }> }}
 *   on success, or { error: string } on failure.
 *
 * Rotation encoded as suffix: '83rot2' → tile_number='83', rotation=2.
 * '0' token → empty space, no entry written.
 */
export function parseMapString(str, playerCount) {
  const positions = SPIRAL_NON_HOME_POSITIONS[playerCount]
  if (!positions) return { error: `Unsupported player count: ${playerCount}` }

  const tokens = str.trim().split(/\s+/)
  if (tokens.length !== positions.length)
    return { error: `Expected ${positions.length} tiles for ${playerCount} players, got ${tokens.length}` }

  const tiles = {}
  const seen = {}
  const HYPERLANE_RANGE = [83, 91]

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '0') continue  // empty space

    const rotMatch = token.match(/^(\d+)rot(\d)$/)
    const tileNumber = rotMatch ? rotMatch[1] : token
    const rotation = rotMatch ? parseInt(rotMatch[2], 10) : 0

    const num = parseInt(tileNumber, 10)
    if (isNaN(num)) return { error: `Unknown tile: ${token} at position ${i + 1}` }

    const isHyperlane = num >= HYPERLANE_RANGE[0] && num <= HYPERLANE_RANGE[1]
    if (!isHyperlane && seen[tileNumber])
      return { error: `Duplicate tile: ${tileNumber} at position ${i + 1}` }
    seen[tileNumber] = true

    tiles[positions[i]] = { tile_number: tileNumber, ...(rotation ? { rotation } : {}) }
  }

  return { tiles }
}
```

## Tests

```js
// parseMapString
// valid 6P string (30 tokens) → correct axial keys and tile_number values
// valid strings for each player count 3–8 → token count matches positions length
// hyperlane token '83rot2' → { tile_number: '83', rotation: 2 }
// hyperlane token '83' (no suffix) → { tile_number: '83' }, no rotation field
// '0' token → no entry for that position
// wrong token count → { error: "Expected N tiles for P players, got M" }
// NaN token → { error: "Unknown tile: ... at position N" }
// duplicate non-hyperlane tile → { error: "Duplicate tile: ..." }
// duplicate hyperlane tile (83) → succeeds (no duplicate error)
// all PRESET_MAPS entries parse without error
```
