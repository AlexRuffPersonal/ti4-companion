const RING1 = ['1,-1','1,0','0,1','-1,1','-1,0','0,-1']
const RING2 = ['2,-2','2,-1','2,0','1,1','0,2','-1,2','-2,2','-2,1','-2,0','-1,-1','0,-2','1,-2']
const RING3_ALL = [
  '3,-3','3,-2','3,-1','3,0','2,1','1,2','0,3','-1,3','-2,3',
  '-3,3','-3,2','-3,1','-3,0','-2,-1','-1,-2','0,-3','1,-3','2,-3',
]

const HOMES_3P = new Set(['3,-3', '-3,3', '0,-3'])
const HOMES_4P = new Set(['3,-3', '3,0', '-3,3', '0,-3'])
const HOMES_5P = new Set(['3,-3', '3,0', '0,3', '-3,3', '0,-3'])
const HOMES_6P = new Set(['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3'])

function nonHomeRing3(homeSet) {
  return RING3_ALL.filter(p => !homeSet.has(p))
}

// Milty-order spiral positions for each player count (non-home, non-Mecatol).
export const SPIRAL_NON_HOME_POSITIONS = {
  3: [...RING1, ...RING2, ...nonHomeRing3(HOMES_3P)],               // 33
  4: [...RING1, ...RING2, ...nonHomeRing3(HOMES_4P)],               // 32
  5: [...RING1, ...RING2, ...nonHomeRing3(HOMES_5P)],               // 31
  6: [...RING1, ...RING2, ...nonHomeRing3(HOMES_6P)],               // 30
  7: [...RING1, ...RING2, ...nonHomeRing3(HOMES_6P), '4,-3','4,-1','3,1'],           // 33
  8: [...RING1, ...RING2, ...nonHomeRing3(HOMES_6P), '4,-3','4,-1','3,1','1,3','-1,4','-4,3'], // 36
}

export const HOME_POSITIONS_BY_COUNT = {
  3: ['3,-3', '-3,3', '0,-3'],
  4: ['3,-3', '3,0', '-3,3', '0,-3'],
  5: ['3,-3', '3,0', '0,3', '-3,3', '0,-3'],
  6: ['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3'],
  7: ['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3', '4,-2'],
  8: ['3,-3', '3,0', '0,3', '-3,3', '-3,0', '0,-3', '4,-2', '-2,4'],
}

const EMPTY_MAP = (count) => Array(count).fill('0').join(' ')

export const PRESET_MAPS = [
  { id: 'base-recommended-3', name: '3P Recommended (Base)', playerCount: 3, mapString: EMPTY_MAP(33), requiresPok: false },
  { id: 'base-recommended-4', name: '4P Recommended (Base)', playerCount: 4, mapString: EMPTY_MAP(32), requiresPok: false },
  { id: 'base-recommended-5', name: '5P Recommended (Base)', playerCount: 5, mapString: EMPTY_MAP(31), requiresPok: false },
  { id: 'base-recommended-6', name: '6P Recommended (Base)', playerCount: 6, mapString: EMPTY_MAP(30), requiresPok: false },
  { id: 'base-recommended-7', name: '7P Recommended (Base)', playerCount: 7, mapString: EMPTY_MAP(33), requiresPok: false },
  { id: 'base-recommended-8', name: '8P Recommended (Base)', playerCount: 8, mapString: EMPTY_MAP(36), requiresPok: false },
  { id: 'pok-recommended-6',  name: '6P Recommended (PoK)', playerCount: 6, mapString: EMPTY_MAP(30), requiresPok: true },
  { id: 'pok-hyperlane-6',    name: '6P Hyperlane (PoK)',   playerCount: 6, mapString: EMPTY_MAP(30), requiresPok: true },
]

const HYPERLANE_MIN = 83
const HYPERLANE_MAX = 91

/**
 * Parse a Milty-format map string for the given player count.
 * @returns {{ tiles: Record<string, { tile_number: string, rotation?: number }> }}
 *   on success, or { error: string } on failure.
 */
export function parseMapString(str, playerCount) {
  const positions = SPIRAL_NON_HOME_POSITIONS[playerCount]
  if (!positions) return { error: `Unsupported player count: ${playerCount}` }

  const tokens = str.trim().split(/\s+/)
  if (tokens.length !== positions.length) {
    return { error: `Expected ${positions.length} tiles for ${playerCount} players, got ${tokens.length}` }
  }

  const tiles = {}
  const seen = {}

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === '0') continue

    const rotMatch = token.match(/^(\d+)rot(\d)$/)
    const tileNumber = rotMatch ? rotMatch[1] : token
    const rotation = rotMatch ? parseInt(rotMatch[2], 10) : 0

    const num = parseInt(tileNumber, 10)
    if (isNaN(num)) return { error: `Unknown tile: ${token} at position ${i + 1}` }

    const isHyperlane = num >= HYPERLANE_MIN && num <= HYPERLANE_MAX
    if (!isHyperlane && seen[tileNumber]) {
      return { error: `Duplicate tile: ${tileNumber} at position ${i + 1}` }
    }
    seen[tileNumber] = true

    tiles[positions[i]] = { tile_number: tileNumber, ...(rotation ? { rotation } : {}) }
  }

  return { tiles }
}
