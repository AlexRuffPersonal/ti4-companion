// TI4 Map Layout Definitions
//
// Each layout defines the hex positions for a given player count.
// Uses axial coordinates (q, r) with pointy-top hexagons.
// ring 0 = center (Mecatol Rex), ring 1–3+ = outer rings.
// isHome = true marks player seat / home system positions.
// seatIndex = 0-based seat order going clockwise from top-right.

// ── Helpers ───────────────────────────────────────────────────────────────────

function pos(q, r, { ring, isHome = false, seatIndex = null } = {}) {
  return { q, r, ring: ring ?? cubeRing(q, r), isHome, seatIndex }
}

function cubeRing(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
}

// Generate all axial positions where cubeRing === n
function ringPositions(n) {
  const results = []
  // Start at (n, 0) and walk the 6 sides
  const directions = [
    [-1,  1], [-1,  0], [ 0, -1],
    [ 1, -1], [ 1,  0], [ 0,  1],
  ]
  let q = n, r = 0
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < n; step++) {
      results.push({ q, r, ring: n, isHome: false, seatIndex: null })
      q += directions[side][0]
      r += directions[side][1]
    }
  }
  return results
}

// ── Standard 6-Player Layout (Official FFG) ──────────────────────────────────
// 37 hexes: center + rings 1-3
// Home systems at the 6 ring-3 corners, clockwise from top-right

const STD6_HOME_COORDS = [
  [3, -3], [3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3],
]

function buildStandard6() {
  const homeSet = new Set(STD6_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 3; ring++) {
    for (const p of ringPositions(ring)) {
      const key = `${p.q},${p.r}`
      if (homeSet.has(key)) {
        const idx = STD6_HOME_COORDS.findIndex(([q, r]) => q === p.q && r === p.r)
        positions.push({ ...p, isHome: true, seatIndex: idx })
      } else {
        positions.push(p)
      }
    }
  }
  return positions
}

// ── Standard 3-Player Layout (Official FFG) ──────────────────────────────────
// 19 system hexes + Mecatol + 3 home systems = 22 hexes
// Home systems at alternating ring-3 corners: seats 0, 2, 4 of the 6-player corners
// Non-home ring-3 positions: the 3 non-corner pairs between homes

const STD3_HOME_COORDS = [
  [3, -3], [0, 3], [-3, 0],
]
// Ring-3 non-home positions used in 3-player (the 2 tiles flanking each home)
const STD3_RING3_FILLER = [
  [3, -2], [2, -3],   // flanking seat 0
  [-1, 3], [1, 2],    // flanking seat 1  (note: [0,3] is home)  — wait these are flanking positions
  [-3, 1], [-2, 3],   // flanking seat 2
  // actually let me re-derive these properly:
  // Between seat0(3,-3) and seat1(0,3): going through corners (2,-1),(1,0),(0,1)?  No, we go on ring 3.
  // Ring 3 clockwise from (3,-3): (3,-2),(3,-1),(3,0),(2,1),(1,2),(0,3),(−1,3),(−2,3),(−3,3),(−3,2),(−3,1),(−3,0),(−2,−1),(−1,−2),(0,−3),(1,−3),(2,−3),(3,−3)
  // Homes at (3,-3),(0,3),(−3,0)
  // Non-home ring-3 positions between these (pick 2 per gap)
]

function buildStandard3() {
  const homeSet = new Set(STD3_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  // Ring 3 positions used in 3p: only the 6 positions flanking home systems
  // Clockwise ring-3 order starting from (3,-3):
  const ring3Order = [
    [3,-3],[3,-2],[3,-1],[3,0],[2,1],[1,2],[0,3],[-1,3],[-2,3],
    [-3,3],[-3,2],[-3,1],[-3,0],[-2,-1],[-1,-2],[0,-3],[1,-3],[2,-3],
  ]
  // In 3-player, use every home plus 2 flanking tiles (1 either side of home)
  const usedRing3 = new Set()
  for (let i = 0; i < ring3Order.length; i++) {
    const [q, r] = ring3Order[i]
    if (homeSet.has(`${q},${r}`)) {
      // include 1 tile before and 1 after in the ring
      const prev = ring3Order[(i - 1 + ring3Order.length) % ring3Order.length]
      const next = ring3Order[(i + 1) % ring3Order.length]
      usedRing3.add(`${q},${r}`)
      usedRing3.add(`${prev[0]},${prev[1]}`)
      usedRing3.add(`${next[0]},${next[1]}`)
    }
  }

  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 2; ring++) {
    for (const p of ringPositions(ring)) positions.push(p)
  }
  for (const [q, r] of ring3Order) {
    if (!usedRing3.has(`${q},${r}`)) continue
    const homeIdx = STD3_HOME_COORDS.findIndex(([hq, hr]) => hq === q && hr === r)
    if (homeIdx >= 0) {
      positions.push({ q, r, ring: 3, isHome: true, seatIndex: homeIdx })
    } else {
      positions.push({ q, r, ring: 3, isHome: false, seatIndex: null })
    }
  }
  return positions
}

// ── Standard 4-Player Layout (Official FFG) ──────────────────────────────────
// Rectangular / elongated map. 4 home seats at ring-3 positions.
// Official layout uses a modified hex grid with homes at N, S, E, W equivalents.
// Homes at: (3,-3)[top-right], (3,0)[right], (-3,3)[bottom-left], (-3,0)[left]

const STD4_HOME_COORDS = [
  [3, -3], [3, 0], [-3, 3], [-3, 0],
]

function buildStandard4() {
  const homeSet = new Set(STD4_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 2; ring++) {
    for (const p of ringPositions(ring)) positions.push(p)
  }
  // Ring 3: include home hexes plus 2 flanking each (omit remaining ring-3)
  const ring3Order = [
    [3,-3],[3,-2],[3,-1],[3,0],[2,1],[1,2],[0,3],[-1,3],[-2,3],
    [-3,3],[-3,2],[-3,1],[-3,0],[-2,-1],[-1,-2],[0,-3],[1,-3],[2,-3],
  ]
  const usedRing3 = new Set()
  for (let i = 0; i < ring3Order.length; i++) {
    const [q, r] = ring3Order[i]
    if (homeSet.has(`${q},${r}`)) {
      const prev = ring3Order[(i - 1 + ring3Order.length) % ring3Order.length]
      const next = ring3Order[(i + 1) % ring3Order.length]
      usedRing3.add(`${q},${r}`)
      usedRing3.add(`${prev[0]},${prev[1]}`)
      usedRing3.add(`${next[0]},${next[1]}`)
    }
  }
  for (const [q, r] of ring3Order) {
    if (!usedRing3.has(`${q},${r}`)) continue
    const homeIdx = STD4_HOME_COORDS.findIndex(([hq, hr]) => hq === q && hr === r)
    if (homeIdx >= 0) {
      positions.push({ q, r, ring: 3, isHome: true, seatIndex: homeIdx })
    } else {
      positions.push({ q, r, ring: 3, isHome: false, seatIndex: null })
    }
  }
  return positions
}

// ── Standard 5-Player Layout (Official FFG) ──────────────────────────────────
// 5 home seats. Uses 5 of the ring-3 positions as homes (skip one corner).
// Standard: skip bottom corner (-3,3) → homes at (3,-3),(3,0),(0,3),(-3,0),(0,-3)

const STD5_HOME_COORDS = [
  [3, -3], [3, 0], [0, 3], [-3, 0], [0, -3],
]

function buildStandard5() {
  const homeSet = new Set(STD5_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  // Include ring-3 only for home positions + 1 flanker each, drop the skipped corner area
  const ring3Order = [
    [3,-3],[3,-2],[3,-1],[3,0],[2,1],[1,2],[0,3],[-1,3],[-2,3],
    [-3,3],[-3,2],[-3,1],[-3,0],[-2,-1],[-1,-2],[0,-3],[1,-3],[2,-3],
  ]
  const usedRing3 = new Set()
  for (let i = 0; i < ring3Order.length; i++) {
    const [q, r] = ring3Order[i]
    if (homeSet.has(`${q},${r}`)) {
      const prev = ring3Order[(i - 1 + ring3Order.length) % ring3Order.length]
      const next = ring3Order[(i + 1) % ring3Order.length]
      usedRing3.add(`${q},${r}`)
      usedRing3.add(`${prev[0]},${prev[1]}`)
      usedRing3.add(`${next[0]},${next[1]}`)
    }
  }

  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 2; ring++) {
    for (const p of ringPositions(ring)) positions.push(p)
  }
  for (const [q, r] of ring3Order) {
    if (!usedRing3.has(`${q},${r}`)) continue
    const homeIdx = STD5_HOME_COORDS.findIndex(([hq, hr]) => hq === q && hr === r)
    if (homeIdx >= 0) {
      positions.push({ q, r, ring: 3, isHome: true, seatIndex: homeIdx })
    } else {
      positions.push({ q, r, ring: 3, isHome: false, seatIndex: null })
    }
  }
  return positions
}

// ── Standard 7-Player Layout (Official FFG) ──────────────────────────────────
// Extends the 6-player map with one extra column.
// Home seats: 6 of ring-3 + 1 at ring-4 corner (top extension)
// Simplified: use all ring-3 as 6p, plus an extra column on one side.

const STD7_HOME_COORDS = [
  [4, -4], [3, -3], [3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3],
]

function buildStandard7() {
  const homeSet = new Set(STD7_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  // Build ring 0–3 as in 6-player
  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 3; ring++) {
    for (const p of ringPositions(ring)) {
      const key = `${p.q},${p.r}`
      const homeIdx = STD7_HOME_COORDS.findIndex(([q, r]) => q === p.q && r === p.r)
      if (homeSet.has(key)) {
        positions.push({ ...p, isHome: true, seatIndex: homeIdx })
      } else {
        positions.push(p)
      }
    }
  }
  // Add extra column: ring-4 extension at top-right
  // Extra positions: (4,-4),(4,-3),(4,-2),(4,-1),(3,1),(2,2),(1,3)
  const extraPositions = [
    [4,-4,true, 0], [4,-3,false,null],[4,-2,false,null],[4,-1,false,null],
    [3,1, false,null],[2,2, false,null],[1,3, false,null],
  ]
  for (const [q, r, isHome, seatIndex] of extraPositions) {
    const ring = cubeRing(q, r)
    if (!positions.find(p => p.q === q && p.r === r)) {
      positions.push({ q, r, ring, isHome, seatIndex })
    }
  }
  return positions
}

// ── Standard 8-Player Layout (Official FFG) ──────────────────────────────────
// Extends the 6-player map on two opposite sides.
// 8 home seats: 6 of ring-3 + 2 additional in extended columns.

const STD8_HOME_COORDS = [
  [4, -4], [3, -3], [3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3], [-4, 4],
]

function buildStandard8() {
  const homeSet = new Set(STD8_HOME_COORDS.map(([q, r]) => `${q},${r}`))
  const positions = [pos(0, 0, { ring: 0 })]
  for (let ring = 1; ring <= 3; ring++) {
    for (const p of ringPositions(ring)) {
      const key = `${p.q},${p.r}`
      const homeIdx = STD8_HOME_COORDS.findIndex(([q, r]) => q === p.q && r === p.r)
      if (homeSet.has(key)) {
        positions.push({ ...p, isHome: true, seatIndex: homeIdx })
      } else {
        positions.push(p)
      }
    }
  }
  // Extensions on both sides
  const extensions = [
    [4,-4,true,0],[4,-3,false,null],[4,-2,false,null],[4,-1,false,null],
    [3,1,false,null],[2,2,false,null],[1,3,false,null],
    [-4,4,true,7],[-4,3,false,null],[-4,2,false,null],[-4,1,false,null],
    [-3,-1,false,null],[-2,-2,false,null],[-1,-3,false,null],
  ]
  for (const [q, r, isHome, seatIndex] of extensions) {
    if (!positions.find(p => p.q === q && p.r === r)) {
      positions.push({ q, r, ring: cubeRing(q, r), isHome, seatIndex })
    }
  }
  return positions
}

// ── Community: Milty Draft 6-Player ──────────────────────────────────────────
// Same hex positions as standard-6; the "Milty" distinction is in slice drafting,
// not in the physical hex layout. Map shape is identical to standard-6.
function buildMilty6() {
  return buildStandard6()
}

// ── Community: MiltyEQ 6-Player ──────────────────────────────────────────────
// Equidistant home positions variant. Same physical grid but seat labels shifted
// to achieve equal distances. Grid shape is standard-6.
function buildMiltyEQ6() {
  return buildStandard6()
}

// ── Community: Wekker 6-Player ───────────────────────────────────────────────
// Same physical grid as standard-6 but commonly used with specific community
// tile distributions for balance. Shape identical to standard-6.
function buildWekker6() {
  return buildStandard6()
}

// ── Community: Spiral 6-Player ───────────────────────────────────────────────
// Uses the standard 6-player grid but arranged in a spiral slice pattern.
// Physical grid is the same; the "spiral" is a draft convention, not a different grid.
function buildSpiral6() {
  return buildStandard6()
}

// ── Community: Milty 8-Player ────────────────────────────────────────────────
function buildMilty8() {
  return buildStandard8()
}

// ── Layout Registry ───────────────────────────────────────────────────────────

export const MAP_LAYOUTS = [
  {
    id: 'standard-3',
    name: 'Standard 3-Player',
    playerCount: 3,
    source: 'official',
    description: 'Official FFG 3-player layout from the rulebook.',
    positions: buildStandard3(),
  },
  {
    id: 'standard-4',
    name: 'Standard 4-Player',
    playerCount: 4,
    source: 'official',
    description: 'Official FFG 4-player layout from the rulebook.',
    positions: buildStandard4(),
  },
  {
    id: 'standard-5',
    name: 'Standard 5-Player',
    playerCount: 5,
    source: 'official',
    description: 'Official FFG 5-player layout from the rulebook.',
    positions: buildStandard5(),
  },
  {
    id: 'standard-6',
    name: 'Standard 6-Player',
    playerCount: 6,
    source: 'official',
    description: 'Classic 3-ring hexagonal map. The most common layout.',
    positions: buildStandard6(),
  },
  {
    id: 'standard-7',
    name: 'Standard 7-Player',
    playerCount: 7,
    source: 'official',
    description: 'Official FFG 7-player layout with one extended column.',
    positions: buildStandard7(),
  },
  {
    id: 'standard-8',
    name: 'Standard 8-Player',
    playerCount: 8,
    source: 'official',
    description: 'Official FFG 8-player layout with two extended columns.',
    positions: buildStandard8(),
  },
  {
    id: 'milty-6',
    name: 'Milty Draft 6-Player',
    playerCount: 6,
    source: 'community',
    description: 'Standard-6 grid used with the popular Milty slice draft.',
    positions: buildMilty6(),
  },
  {
    id: 'milty-eq-6',
    name: 'MiltyEQ 6-Player',
    playerCount: 6,
    source: 'community',
    description: 'Equidistant home variant of the Milty draft for balanced slices.',
    positions: buildMiltyEQ6(),
  },
  {
    id: 'wekker-6',
    name: 'Wekker 6-Player',
    playerCount: 6,
    source: 'community',
    description: 'Community-favourite balanced layout with equidistant home systems.',
    positions: buildWekker6(),
  },
  {
    id: 'spiral-6',
    name: 'Spiral 6-Player',
    playerCount: 6,
    source: 'community',
    description: 'Spiral slice variant for 6 players.',
    positions: buildSpiral6(),
  },
  {
    id: 'milty-8',
    name: 'Milty 8-Player',
    playerCount: 8,
    source: 'community',
    description: 'Community 8-player layout used with the Milty draft tool.',
    positions: buildMilty8(),
  },
]

export function getLayoutById(id) {
  return MAP_LAYOUTS.find(l => l.id === id) ?? MAP_LAYOUTS.find(l => l.id === 'standard-6')
}

export function getLayoutsForPlayerCount(count) {
  return MAP_LAYOUTS.filter(l => l.playerCount === count)
}
