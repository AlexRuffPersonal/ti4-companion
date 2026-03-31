// TI4 System Tile Data
// Covers: Base Game, Prophecy of Kings (PoK), Thunder's Edge (TE)
//
// tile structure:
//   id        — official tile number
//   expansion — 'base' | 'pok' | 'te'
//   type      — 'home' | 'blue' | 'red' | 'mecatol' | 'hyperlane' | 'frontier'
//   homeFor   — faction name string if type === 'home', else null
//   planets   — array of { name, resources, influence, trait?, legendary? }
//               trait: 'cultural' | 'hazardous' | 'industrial' | null
//   anomaly   — null | 'asteroid_field' | 'nebula' | 'supernova' | 'gravity_rift' | 'entropic_scar'
//   wormhole  — null | 'alpha' | 'beta' | 'delta' | 'gamma'

// ── Base Game: Home Systems (1–17) ───────────────────────────────────────────
const BASE_HOME_TILES = [
  {
    id: 1, expansion: 'base', type: 'home', homeFor: 'The Arborec',
    planets: [{ name: 'Nestphar', resources: 3, influence: 2 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 2, expansion: 'base', type: 'home', homeFor: 'The Barony of Letnev',
    planets: [
      { name: 'Arc Prime',  resources: 4, influence: 0 },
      { name: 'Wren',       resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 3, expansion: 'base', type: 'home', homeFor: 'The Clan of Saar',
    planets: [
      { name: 'Lisis II',   resources: 1, influence: 0 },
      { name: 'Ragh',       resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 4, expansion: 'base', type: 'home', homeFor: 'The Embers of Muaat',
    planets: [{ name: 'Muaat', resources: 4, influence: 1 }],
    anomaly: 'supernova', wormhole: null,
  },
  {
    id: 5, expansion: 'base', type: 'home', homeFor: 'The Emirates of Hacan',
    planets: [
      { name: 'Arretze',   resources: 2, influence: 0 },
      { name: 'Hercant',   resources: 1, influence: 1 },
      { name: 'Kamdorn',   resources: 0, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 6, expansion: 'base', type: 'home', homeFor: 'The Federation of Sol',
    planets: [
      { name: 'Jord',   resources: 4, influence: 2 },
      { name: 'Demis',  resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 7, expansion: 'base', type: 'home', homeFor: 'The Ghosts of Creuss',
    planets: [{ name: 'Creuss', resources: 4, influence: 2 }],
    anomaly: null, wormhole: 'delta',
  },
  {
    id: 8, expansion: 'base', type: 'home', homeFor: 'The L1Z1X Mindnet',
    planets: [{ name: '[000.00]', resources: 5, influence: 0 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 9, expansion: 'base', type: 'home', homeFor: 'The Mentak Coalition',
    planets: [
      { name: 'Moll Primus', resources: 4, influence: 1 },
      { name: 'Shuk',        resources: 1, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 10, expansion: 'base', type: 'home', homeFor: 'The Naalu Collective',
    planets: [
      { name: 'Nar',    resources: 3, influence: 1 },
      { name: 'Naluu',  resources: 0, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 11, expansion: 'base', type: 'home', homeFor: 'The Nekro Virus',
    planets: [
      { name: 'Mordai II', resources: 4, influence: 0 },
      { name: 'Daemon',    resources: 0, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 12, expansion: 'base', type: 'home', homeFor: "Sardakk N'orr",
    planets: [
      { name: 'Quinarra',  resources: 3, influence: 1 },
      { name: "Tren'lak",  resources: 1, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 13, expansion: 'base', type: 'home', homeFor: 'The Universities of Jol-Nar',
    planets: [
      { name: 'Jol', resources: 3, influence: 2 },
      { name: 'Nar', resources: 2, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 14, expansion: 'base', type: 'home', homeFor: 'The Winnu',
    planets: [{ name: 'Winnu', resources: 3, influence: 4 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 15, expansion: 'base', type: 'home', homeFor: 'The Xxcha Kingdom',
    planets: [
      { name: 'Xxcha',       resources: 3, influence: 1 },
      { name: 'Archon Tau',  resources: 2, influence: 0 },
      { name: 'Archon Ren',  resources: 1, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 16, expansion: 'base', type: 'home', homeFor: 'The Yin Brotherhood',
    planets: [
      { name: 'Darien', resources: 3, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 17, expansion: 'base', type: 'home', homeFor: 'The Yssaril Tribes',
    planets: [
      { name: "Shala'Kaar", resources: 3, influence: 4 },
      { name: 'Valk',       resources: 2, influence: 0 },
      { name: 'Avar',       resources: 1, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
]

// ── Base Game: Mecatol Rex (18) ───────────────────────────────────────────────
const MECATOL_TILE = {
  id: 18, expansion: 'base', type: 'mecatol', homeFor: null,
  planets: [{ name: 'Mecatol Rex', resources: 1, influence: 6 }],
  anomaly: null, wormhole: null,
}

// ── Base Game: Blue-Back Systems (19–40) ─────────────────────────────────────
const BASE_BLUE_TILES = [
  {
    id: 19, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Maaluuk', resources: 0, influence: 2 },
      { name: 'Druaa',   resources: 3, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 20, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Lazar',   resources: 1, influence: 0 },
      { name: 'Sakulag', resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 21, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Vefut II', resources: 2, influence: 2 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 22, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Thibah', resources: 1, influence: 2 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 23, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Quann', resources: 2, influence: 1 }],
    anomaly: null, wormhole: 'beta',
  },
  {
    id: 24, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Lodor', resources: 3, influence: 1 }],
    anomaly: null, wormhole: 'alpha',
  },
  {
    id: 25, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'New Albion', resources: 1, influence: 1, trait: 'industrial' },
      { name: 'Starpoint',  resources: 3, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 26, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: "Tequ'ran", resources: 2, influence: 0 },
      { name: 'Torkan',   resources: 0, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 27, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: "Qucen'n", resources: 1, influence: 2 },
      { name: 'Rarron',  resources: 0, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 28, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Mellon', resources: 0, influence: 2 },
      { name: 'Zohbat', resources: 3, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 29, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Dal Bootha', resources: 0, influence: 2 },
      { name: 'Xxehan',     resources: 1, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 30, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Corneeq',  resources: 1, influence: 2 },
      { name: 'Resculon', resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 31, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Centauri', resources: 1, influence: 3, trait: 'cultural' },
      { name: 'Gral',     resources: 1, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 32, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Bereg',    resources: 3, influence: 1 },
      { name: 'Lirta IV', resources: 2, influence: 0, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 33, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Abyz',  resources: 3, influence: 0, trait: 'hazardous' },
      { name: 'Fria',  resources: 2, influence: 0, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 34, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Arinam', resources: 1, influence: 2, trait: 'industrial' },
      { name: 'Meer',   resources: 0, influence: 3, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 35, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Industrex', resources: 2, influence: 0, trait: 'industrial' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 36, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Wellon', resources: 1, influence: 2, trait: 'industrial' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 37, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Saudor', resources: 2, influence: 2 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 38, expansion: 'base', type: 'blue', homeFor: null,
    planets: [{ name: 'Mehar Xull', resources: 1, influence: 3, trait: 'hazardous' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 39, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Tar-Mann', resources: 1, influence: 1, trait: 'industrial' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 40, expansion: 'base', type: 'blue', homeFor: null,
    planets: [
      { name: 'Retillion', resources: 2, influence: 0, trait: 'hazardous' },
      { name: 'Shalloq',   resources: 1, influence: 2, trait: 'cultural' },
    ],
    anomaly: null, wormhole: null,
  },
]

// ── Base Game: Red-Back Systems (41–50) ──────────────────────────────────────
const BASE_RED_TILES = [
  {
    id: 41, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'asteroid_field', wormhole: null,
  },
  {
    id: 42, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'asteroid_field', wormhole: null,
  },
  {
    id: 43, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'supernova', wormhole: null,
  },
  {
    id: 44, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'gravity_rift', wormhole: null,
  },
  {
    id: 45, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'nebula', wormhole: null,
  },
  {
    id: 46, expansion: 'base', type: 'red', homeFor: null,
    planets: [{ name: 'Abaddon', resources: 1, influence: 0 }],
    anomaly: null, wormhole: 'alpha',
  },
  {
    id: 47, expansion: 'base', type: 'red', homeFor: null,
    planets: [{ name: 'Perimeter', resources: 2, influence: 1 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 48, expansion: 'base', type: 'red', homeFor: null,
    planets: [{ name: 'Ashtroth', resources: 2, influence: 0, trait: 'hazardous' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 49, expansion: 'base', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'asteroid_field', wormhole: 'beta',
  },
  {
    id: 50, expansion: 'base', type: 'red', homeFor: null,
    planets: [{ name: 'Creuss Rift', resources: 3, influence: 4 }],
    anomaly: 'gravity_rift', wormhole: 'delta',
  },
]

// ── PoK: Home Systems (52–58) ─────────────────────────────────────────────────
const POK_HOME_TILES = [
  {
    id: 52, expansion: 'pok', type: 'home', homeFor: 'The Argent Flight',
    planets: [
      { name: 'Valk',  resources: 2, influence: 0 },
      { name: 'Avar',  resources: 3, influence: 0 },
      { name: 'Ylir',  resources: 0, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 53, expansion: 'pok', type: 'home', homeFor: 'The Empyrean',
    planets: [
      { name: 'Avloh', resources: 0, influence: 3 },
      { name: 'Valk',  resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 54, expansion: 'pok', type: 'home', homeFor: 'The Mahact Gene-Sorcerers',
    planets: [{ name: 'Ixth', resources: 3, influence: 5 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 55, expansion: 'pok', type: 'home', homeFor: 'The Naaz-Rokha Alliance',
    planets: [
      { name: 'Naazir', resources: 2, influence: 0 },
      { name: 'Rokha',  resources: 1, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 56, expansion: 'pok', type: 'home', homeFor: 'The Nomad',
    planets: [{ name: 'Arcturus', resources: 4, influence: 0 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 57, expansion: 'pok', type: 'home', homeFor: 'The Titans of Ul',
    planets: [
      { name: 'Elysium', resources: 4, influence: 2 },
      { name: 'Ul',      resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 58, expansion: 'pok', type: 'home', homeFor: "The Vuil'raith Cabal",
    planets: [
      { name: 'Etir', resources: 4, influence: 0 },
      { name: 'Ioss', resources: 0, influence: 2 },
    ],
    anomaly: 'gravity_rift', wormhole: null,
  },
]

// ── PoK: New Systems (59–82) ──────────────────────────────────────────────────
const POK_BLUE_TILES = [
  {
    id: 59, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Archon Vail', resources: 1, influence: 3, trait: 'hazardous' },
      { name: 'Persephone',  resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 60, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [{ name: 'Delmor', resources: 2, influence: 1 }],
    anomaly: null, wormhole: null,
  },
  {
    id: 61, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [{ name: 'Garbozia', resources: 3, influence: 1, trait: 'industrial' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 62, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Nokar', resources: 1, influence: 2 },
      { name: 'Xxehan', resources: 0, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 63, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [{ name: 'Ssshar', resources: 1, influence: 3, trait: 'cultural' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 64, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Naazir',  resources: 2, influence: 0 },
      { name: 'Rokha',   resources: 0, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 65, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [{ name: 'Ylir', resources: 0, influence: 2, trait: 'cultural' }],
    anomaly: null, wormhole: null,
  },
  {
    id: 66, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Rigel I',  resources: 0, influence: 1 },
      { name: 'Rigel II', resources: 1, influence: 2 },
      { name: 'Rigel III', resources: 1, influence: 1, trait: 'industrial' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 67, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Treis',  resources: 2, influence: 3, trait: 'cultural' },
      { name: 'Mvassenet', resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 68, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Salin', resources: 2, influence: 3 },
      { name: 'Lodor', resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 69, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Archon Tau', resources: 2, influence: 0 },
      { name: 'Archon Ren', resources: 1, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 70, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Archon Vail', resources: 1, influence: 3, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 71, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Alio Prima', resources: 2, influence: 1, trait: 'cultural' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 72, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Hope\'s End', resources: 3, influence: 0, trait: 'hazardous', legendary: true },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 73, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Primor', resources: 2, influence: 1, trait: 'cultural', legendary: true },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 74, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Accoen', resources: 2, influence: 3 },
      { name: 'Joel Ir', resources: 2, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 75, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Sissiri', resources: 2, influence: 3 },
      { name: 'Loki',    resources: 1, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 76, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Abaddon', resources: 1, influence: 0 },
      { name: 'Lazar',   resources: 1, influence: 0 },
      { name: 'Sakulag', resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 77, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Vega Minor', resources: 2, influence: 1, trait: 'cultural' },
      { name: 'Vega Major', resources: 3, influence: 1, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 78, expansion: 'pok', type: 'blue', homeFor: null,
    planets: [
      { name: 'Vorhal', resources: 0, influence: 2, trait: 'cultural' },
      { name: 'Atlas',  resources: 3, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
]

const POK_RED_TILES = [
  {
    id: 79, expansion: 'pok', type: 'red', homeFor: null,
    planets: [{ name: 'Silence', resources: 2, influence: 3, trait: 'cultural' }],
    anomaly: null, wormhole: 'beta',
  },
  {
    id: 80, expansion: 'pok', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'asteroid_field', wormhole: 'alpha',
  },
  {
    id: 81, expansion: 'pok', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'gravity_rift', wormhole: null,
  },
  {
    id: 82, expansion: 'pok', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'nebula', wormhole: null,
  },
]

// ── PoK: Hyperlane Tiles (83–91) ──────────────────────────────────────────────
const POK_HYPERLANE_TILES = [
  { id: 83, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 84, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 85, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 86, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 87, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 88, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 89, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 90, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
  { id: 91, expansion: 'pok', type: 'hyperlane', homeFor: null, planets: [], anomaly: null, wormhole: null },
]

// ── Thunder's Edge: Home Systems (92–97) ────────────────────────────────────
const TE_HOME_TILES = [
  {
    id: 92, expansion: 'te', type: 'home', homeFor: 'The Council Keleres',
    planets: [
      { name: 'Moll Primus', resources: 4, influence: 1 },
      { name: 'Xxcha',       resources: 3, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 93, expansion: 'te', type: 'home', homeFor: 'Last Bastion',
    planets: [
      { name: 'Bastion Prime', resources: 3, influence: 2 },
      { name: 'Rampart',       resources: 1, influence: 3 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 94, expansion: 'te', type: 'home', homeFor: 'The Ral Nel Consortium',
    planets: [
      { name: 'Ral Nel', resources: 4, influence: 1 },
      { name: 'Convergence Station', resources: 1, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 95, expansion: 'te', type: 'home', homeFor: 'The Crimson Rebellion',
    planets: [
      { name: 'Cindari',  resources: 3, influence: 1 },
      { name: 'Scorch',   resources: 2, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 96, expansion: 'te', type: 'home', homeFor: 'The Deepwrought Scholarate',
    planets: [
      { name: 'Excavia',  resources: 2, influence: 3, trait: 'industrial' },
      { name: 'The Dig',  resources: 3, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 97, expansion: 'te', type: 'home', homeFor: 'The Firmament / The Obsidian',
    planets: [
      { name: 'The Firmament', resources: 2, influence: 4 },
      { name: 'Obsidian Gate', resources: 3, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
]

// ── Thunder's Edge: New Systems (98–120) ─────────────────────────────────────
const TE_BLUE_TILES = [
  {
    id: 98, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Styx', resources: 1, influence: 6, legendary: true },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 99, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Hallex',  resources: 2, influence: 1, trait: 'cultural' },
      { name: 'Pyrexis', resources: 2, influence: 0, trait: 'hazardous' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 100, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Seraph',  resources: 3, influence: 2 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 101, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Korrindal', resources: 1, influence: 3, trait: 'cultural' },
      { name: 'Vesper',    resources: 2, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 102, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Osyris', resources: 3, influence: 1, trait: 'industrial' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 103, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Iridian', resources: 0, influence: 3 },
      { name: 'Morru',   resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 104, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Thetis', resources: 1, influence: 2, trait: 'cultural' },
      { name: 'Argol',  resources: 3, influence: 0 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 105, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Vellum', resources: 2, influence: 2, trait: 'industrial' },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 106, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Pyrex I',  resources: 2, influence: 0 },
      { name: 'Pyrex II', resources: 1, influence: 2 },
      { name: 'Pyrex III', resources: 0, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 107, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Caldera', resources: 3, influence: 1, trait: 'hazardous', legendary: true },
    ],
    anomaly: null, wormhole: null,
  },
  {
    id: 108, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Eshtar', resources: 2, influence: 3 },
    ],
    anomaly: null, wormhole: 'gamma',
  },
  {
    id: 109, expansion: 'te', type: 'blue', homeFor: null,
    planets: [
      { name: 'Miraxis', resources: 1, influence: 2 },
      { name: 'Lorix',   resources: 2, influence: 1 },
    ],
    anomaly: null, wormhole: null,
  },
]

const TE_RED_TILES = [
  {
    id: 110, expansion: 'te', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'entropic_scar', wormhole: null,
  },
  {
    id: 111, expansion: 'te', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'entropic_scar', wormhole: null,
  },
  {
    id: 112, expansion: 'te', type: 'red', homeFor: null,
    planets: [{ name: 'Keleres Station', resources: 1, influence: 1 }],
    anomaly: 'entropic_scar', wormhole: null,
  },
  {
    id: 113, expansion: 'te', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'asteroid_field', wormhole: 'gamma',
  },
  {
    id: 114, expansion: 'te', type: 'red', homeFor: null,
    planets: [],
    anomaly: 'gravity_rift', wormhole: null,
  },
  {
    id: 115, expansion: 'te', type: 'red', homeFor: null,
    planets: [{ name: 'Dross', resources: 0, influence: 3 }],
    anomaly: 'nebula', wormhole: null,
  },
]

// ── PoK: Frontier / Special Tiles ─────────────────────────────────────────────
const POK_SPECIAL_TILES = [
  {
    id: 51, expansion: 'pok', type: 'frontier', homeFor: null,
    planets: [],
    anomaly: null, wormhole: null,
  },
]

// ── Combined Export ───────────────────────────────────────────────────────────
export const TILES = [
  ...BASE_HOME_TILES,
  MECATOL_TILE,
  ...BASE_BLUE_TILES,
  ...BASE_RED_TILES,
  ...POK_SPECIAL_TILES,
  ...POK_HOME_TILES,
  ...POK_BLUE_TILES,
  ...POK_RED_TILES,
  ...POK_HYPERLANE_TILES,
  ...TE_HOME_TILES,
  ...TE_BLUE_TILES,
  ...TE_RED_TILES,
]

export function getTileById(id) {
  return TILES.find(t => t.id === id) ?? null
}

export function getTilesByExpansion(expansions) {
  // expansions: { base: bool, pok: bool, te: bool }
  return TILES.filter(t => expansions[t.expansion])
}

export function getTileResources(tile) {
  return tile.planets.reduce((sum, p) => sum + p.resources, 0)
}

export function getTileInfluence(tile) {
  return tile.planets.reduce((sum, p) => sum + p.influence, 0)
}

export const ANOMALY_LABELS = {
  asteroid_field: 'AST',
  supernova:      'SN',
  nebula:         'NB',
  gravity_rift:   'GR',
  entropic_scar:  'ES',
}

export const WORMHOLE_LABELS = {
  alpha: 'α',
  beta:  'β',
  delta: 'δ',
  gamma: 'γ',
}
