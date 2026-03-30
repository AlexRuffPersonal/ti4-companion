// ─── Factions ────────────────────────────────────────────────────────────────

export const FACTIONS = {
  base: [
    'The Arborec',
    'The Barony of Letnev',
    'The Clan of Saar',
    'The Embers of Muaat',
    'The Emirates of Hacan',
    'The Federation of Sol',
    'The Ghosts of Creuss',
    'The L1Z1X Mindnet',
    'The Mentak Coalition',
    'The Naalu Collective',
    'The Nekro Virus',
    'Sardakk N\'orr',
    'The Universities of Jol-Nar',
    'The Winnu',
    'The Xxcha Kingdom',
    'The Yin Brotherhood',
    'The Yssaril Tribes',
  ],
  pok: [
    'The Argent Flight',
    'The Empyrean',
    'The Mahact Gene-Sorcerers',
    'The Naaz-Rokha Alliance',
    'The Nomad',
    'The Titans of Ul',
    'The Vuil\'raith Cabal',
  ],
  te: [
    'The Council Keleres',
    'Last Bastion',
    'The Ral Nel Consortium',
    'The Crimson Rebellion',
    'The Deepwrought Scholarate',
    'The Firmament / The Obsidian',
  ],
}

export const ALL_FACTIONS = [...FACTIONS.base, ...FACTIONS.pok, ...FACTIONS.te]

// ─── Player Colours ───────────────────────────────────────────────────────────

export const PLAYER_COLOURS = [
  { id: 'yellow',  label: 'Yellow',  hex: '#f59e0b', tw: 'accent-yellow' },
  { id: 'blue',    label: 'Blue',    hex: '#3b82f6', tw: 'accent-blue'   },
  { id: 'red',     label: 'Red',     hex: '#ef4444', tw: 'accent-red'    },
  { id: 'green',   label: 'Green',   hex: '#10b981', tw: 'accent-green'  },
  { id: 'purple',  label: 'Purple',  hex: '#8b5cf6', tw: 'accent-purple' },
  { id: 'orange',  label: 'Orange',  hex: '#f97316', tw: 'accent-orange' },
  { id: 'pink',    label: 'Pink',    hex: '#ec4899', tw: 'accent-pink'   },
  { id: 'cyan',    label: 'Cyan',    hex: '#06b6d4', tw: 'accent-cyan'   },
]

// ─── Strategy Cards ───────────────────────────────────────────────────────────

export const STRATEGY_CARDS = [
  {
    id: 1, name: 'Leadership', short: 'LEAD',
    primary:   'Gain 3 command tokens. Place them in any combination of your command token pools.',
    secondary: 'Spend 1 token from your strategy pool. Gain 2 command tokens. Place them in any combination of your command token pools.',
  },
  {
    id: 2, name: 'Diplomacy', short: 'DIPL',
    primary:   'Choose 1 system other than Mecatol Rex that contains a planet you own. Each other player places a command token from their reinforcements in that system. Gain trade goods equal to the number of players who cannot. Then redistribute your command tokens.',
    secondary: 'Spend 1 token from your strategy pool. Retreat all of your ships from 1 system that contains another player\'s ships to an adjacent system that contains one of your ships or planets you control.',
  },
  {
    id: 3, name: 'Politics', short: 'POLI',
    primary:   'Choose a player. That player gains the Speaker token. Draw 2 action cards. Draw the top 3 agendas from the deck, look at them, and place them on the bottom in any order.',
    secondary: 'Spend 1 token from your strategy pool. Draw 2 action cards.',
  },
  {
    id: 4, name: 'Construction', short: 'CONS',
    primary:   'Place 1 Space Dock in a system that contains a planet you control. Then place 1 PDS in a system that contains a planet you control.',
    secondary: 'Spend 1 token from your strategy pool. Place 1 Space Dock or 1 PDS in a system that contains a planet you control.',
  },
  {
    id: 5, name: 'Trade', short: 'TRAD',
    primary:   'Gain 5 trade goods. Replenish your commodities. Each other player may replenish their commodities by spending 1 trade good.',
    secondary: 'Spend 1 token from your strategy pool. Replenish your commodities.',
  },
  {
    id: 6, name: 'Warfare', short: 'WAR',
    primary:   'Remove 1 of your command tokens from the game board and return it to your reinforcements. Redistribute your command tokens.',
    secondary: 'Spend 1 token from your strategy pool. Remove 1 of your command tokens from the game board and return it to your reinforcements.',
  },
  {
    id: 7, name: 'Technology', short: 'TECH',
    primary:   'Research 1 technology. You may spend 6 resources to research 1 additional technology.',
    secondary: 'Spend 1 token from your strategy pool and 4 resources. Research 1 technology.',
  },
  {
    id: 8, name: 'Imperial', short: 'IMP',
    primary:   'Immediately score 1 public or secret objective if you qualify. Draw 1 secret objective and gain 1 trade good.',
    secondary: 'Spend 1 token from your strategy pool. Cast votes on an agenda equal to your influence.',
  },
]

// ─── Game Phases ──────────────────────────────────────────────────────────────

export const PHASES = ['strategy', 'action', 'status', 'agenda']

export const PHASE_LABELS = {
  strategy: 'Strategy Phase',
  action:   'Action Phase',
  status:   'Status Phase',
  agenda:   'Agenda Phase',
}

export const PHASE_DESCRIPTIONS = {
  strategy: 'Speaker picks first. Unchosen cards gain 1 trade good each.',
  action:   'Players act in initiative order. Cannot pass until strategic action taken.',
  status:   'Score → Reveal → Draw → Remove tokens → Gain tokens → Ready → Repair → Return cards.',
  agenda:   'Resolve 2 agendas. Vote by exhausting planets. Speaker breaks ties.',
}

// ─── Galactic Events ──────────────────────────────────────────────────────────

export const GALACTIC_EVENTS = [
  { name: 'Advent of the War Sun',       complexity: 1 },
  { name: 'Age of Commerce',             complexity: 1 },
  { name: 'Age of Exploration',          complexity: 2 },
  { name: 'Age of Fighters',             complexity: 3 },
  { name: 'Call of the Void',            complexity: 1 },
  { name: 'Civilized Society',           complexity: 2 },
  { name: 'Conventions of War Abandoned',complexity: 3 },
  { name: 'Cosmic Phenomena',            complexity: 2 },
  { name: 'Cultural Exchange Program',   complexity: 2 },
  { name: 'Dangerous Wilds',             complexity: 1 },
  { name: 'Hidden Agenda',               complexity: 2 },
  { name: 'Mercenaries for Hire',        complexity: 1 },
  { name: 'Minor Factions',              complexity: 2 },
  { name: 'Monuments to the Ages',       complexity: 2 },
  { name: 'Rapid Mobilization',          complexity: 1 },
  { name: 'Stellar Atomics',             complexity: 2 },
  { name: 'Total War',                   complexity: 3 },
  { name: 'Weird Wormholes',             complexity: 3 },
  { name: 'Wild, Wild Galaxy',           complexity: 3 },
  { name: 'Zealous Orthodoxy',           complexity: 1 },
]

// ─── Agendas (50 total) ───────────────────────────────────────────────────────

export const AGENDAS = [
  // Laws
  { name: 'Anti-Intellectual Revolution', type: 'law',       outcome: 'For / Against' },
  { name: 'Arms Reduction',               type: 'law',       outcome: 'For / Against' },
  { name: 'Articles of War',              type: 'law',       outcome: 'For / Against' },
  { name: 'Checks and Balances',          type: 'law',       outcome: 'For / Against', note: 'For: each player passes chosen strategy card to a neighbor each round.' },
  { name: 'Classified Document Leaks',    type: 'law',       outcome: 'Elect secret objective', note: 'Elected secret becomes a public objective.' },
  { name: 'Conventions of War',           type: 'law',       outcome: 'For / Against' },
  { name: 'The Crown of Emphidia',        type: 'law',       outcome: 'Elect player', note: 'Gains 1 VP; loses it when they lose a legendary planet or home system planet.' },
  { name: 'The Crown of Thalnos',         type: 'law',       outcome: 'Elect player' },
  { name: 'Demilitarized Zone',           type: 'law',       outcome: 'Elect cultural planet', note: 'Attach: no units can be placed on this planet.' },
  { name: 'Economic Equality',            type: 'law',       outcome: 'For / Against' },
  { name: 'Enforced Travel Ban',          type: 'law',       outcome: 'For / Against', note: 'For: ships cannot move through wormholes (not Creuss).' },
  { name: 'Executive Sanctions',          type: 'law',       outcome: 'For / Against', note: 'For: max 3 action cards per player (not Yssaril).' },
  { name: 'Fleet Regulations',            type: 'law',       outcome: 'For / Against', note: 'For: max 4 non-fighter ships per system.' },
  { name: 'Holy Planet of Ixth',          type: 'law',       outcome: 'Elect player', note: 'Gains 1 VP; loses it if they produce units using a space dock.' },
  { name: 'Homeland Defense Act',         type: 'law',       outcome: 'For / Against' },
  { name: 'Imperial Arbiter',             type: 'law',       outcome: 'Elect player', note: 'Owner may swap strategy cards with another player each strategy phase.' },
  { name: 'Incentive Program',            type: 'law',       outcome: 'For / Against' },
  { name: 'Nexus Sovereignty',            type: 'law',       outcome: 'For / Against' },
  { name: 'Political Censure',            type: 'law',       outcome: 'Elect player', note: 'Elected player cannot play action cards while this law is in play.' },
  { name: 'Prophecy of Ixth',             type: 'law',       outcome: 'Elect player' },
  { name: 'Publicize Weapon Schematics',  type: 'law',       outcome: 'For / Against' },
  { name: 'Representative Government',    type: 'law',       outcome: 'For / Against', note: 'For: each player may only cast 1 vote per agenda.' },
  { name: 'Research Team: Biotic',        type: 'law',       outcome: 'Elect industrial planet' },
  { name: 'Research Team: Cybernetic',    type: 'law',       outcome: 'Elect industrial planet' },
  { name: 'Research Team: Propulsion',    type: 'law',       outcome: 'Elect industrial planet' },
  { name: 'Research Team: Warfare',       type: 'law',       outcome: 'Elect industrial planet' },
  { name: 'Senate Sanctuary',             type: 'law',       outcome: 'Elect cultural planet', note: 'Attach: planet gains +4 influence.' },
  { name: 'Shard of the Throne',          type: 'law',       outcome: 'Elect player', note: 'Gains 1 VP; passes to attacker who conquers owner\'s legendary planet or home system.' },
  { name: 'Shared Research',              type: 'law',       outcome: 'For / Against' },
  { name: 'Wormhole Reconstruction',      type: 'law',       outcome: 'For / Against', note: 'For: all alpha wormholes connect to all beta wormholes.' },
  // Directives
  { name: 'Archived Secret',              type: 'directive', outcome: 'For / Against', note: 'For: each player draws 1 secret objective.' },
  { name: 'Armed Forces Standardization', type: 'directive', outcome: 'For / Against' },
  { name: 'Clandestine Operations',       type: 'directive', outcome: 'For / Against', note: 'For: each player removes 3 command tokens from fleet pool.' },
  { name: 'Colonial Redistribution',      type: 'directive', outcome: 'Elect non-home planet' },
  { name: 'Committee Formation',          type: 'directive', outcome: 'Elect player' },
  { name: 'Compensated Disarmament',      type: 'directive', outcome: 'Elect planet' },
  { name: 'Core Mining',                  type: 'directive', outcome: 'Elect hazardous planet' },
  { name: 'Covert Legislation',           type: 'directive', outcome: 'For / Against', note: 'Complex — see tirules2.com' },
  { name: 'Galactic Crisis Pact',         type: 'directive', outcome: 'Elect strategy card', note: 'All players immediately resolve the secondary ability of the elected strategy card.' },
  { name: 'Ixthian Artifact',             type: 'directive', outcome: 'For / Against', note: 'For: each player researches 2 techs. Against: each player destroys 3 units adjacent to Mecatol Rex.' },
  { name: 'Judicial Abolishment',         type: 'directive', outcome: 'Elect law' },
  { name: 'Minister of Antiquities',      type: 'directive', outcome: 'Elect player' },
  { name: 'Minister of Commerce',         type: 'directive', outcome: 'Elect player', note: 'Gains 3 TG whenever commodities replenished.' },
  { name: 'Minister of Exploration',      type: 'directive', outcome: 'Elect player', note: 'Gains 1 TG whenever they gain control of a planet.' },
  { name: 'Minister of Industry',         type: 'directive', outcome: 'Elect player' },
  { name: 'Minister of Peace',            type: 'directive', outcome: 'Elect player' },
  { name: 'Minister of Policy',           type: 'directive', outcome: 'Elect player', note: 'Draws 3 extra action cards during status phase.' },
  { name: 'Minister of Sciences',         type: 'directive', outcome: 'Elect player' },
  { name: 'Minister of War',              type: 'directive', outcome: 'Elect player', note: 'May discard action card to perform an extra action.' },
  { name: 'Miscount Disclosed',           type: 'directive', outcome: 'Elect law', note: 'Elected law is revoted. Complex — see tirules2.com.' },
  { name: 'Mutiny',                       type: 'directive', outcome: 'For / Against', note: 'For: player with fewest VPs gains 1 VP. Against: player with most VPs loses 1 VP.' },
  { name: 'New Constitution',             type: 'directive', outcome: 'For / Against', note: 'For: all laws discarded; each player exhausts all planets not in their home system.' },
  { name: 'Public Execution',             type: 'directive', outcome: 'Elect player' },
  { name: 'Rearmament Agreement',         type: 'directive', outcome: 'For / Against', note: 'For: each player places 1 mech on home system planet. Against: each player destroys all mechs.' },
  { name: 'Regulated Conscription',       type: 'directive', outcome: 'For / Against' },
  { name: 'Research Grant Reallocation',  type: 'directive', outcome: 'Elect technology' },
  { name: 'Search Warrant',               type: 'directive', outcome: 'Elect player', note: 'Elected player reveals hand; each other player draws 1 secret objective.' },
  { name: 'Seed of an Empire',            type: 'directive', outcome: 'For / Against', note: 'For: player with most VPs gains 1 VP. Against: player with fewest VPs gains 1 VP.' },
  { name: 'Swords to Plowshares',         type: 'directive', outcome: 'For / Against', note: 'For: each player destroys half their infantry (round up); gains 1 TG per destroyed unit.' },
  { name: 'Terraforming Initiative',      type: 'directive', outcome: 'Elect hazardous planet' },
  { name: 'Unconventional Measures',      type: 'directive', outcome: 'For / Against' },
  { name: 'Wormhole Research',            type: 'directive', outcome: 'For / Against', note: 'For: players with ships in alpha/beta wormholes research 1 tech, then destroy those ships.' },
]

// ─── Technologies ─────────────────────────────────────────────────────────────

export const TECHNOLOGIES = {
  red: [
    'Duranium Armor', 'Integrated Economy', 'Magen Defense Grid', 'Vortex Canon',
    'Assault Cannon', 'Chaos Mapping', 'Non-Euclidean Shielding',
    'X-89 Bacterial Weapon', 'Graviton Laser System', 'Mageon Implants',
    'Valefar Assimilator X', 'Valefar Assimilator Y',
  ],
  blue: [
    'Neural Motivator', 'Antimass Deflectors', 'Sling Relay', 'Fleet Logistics',
    'Light-Wave Deflector', 'Wormhole Generator', 'Quantum Entanglement',
    'Instinct Training', 'Aetherpassage', 'Mirror Computing',
    'Lazax Gate Folding', 'Vortex',
  ],
  green: [
    'Neuroglaive', 'Bio-Stims', 'Predictive Intelligence', 'Spec Ops II',
    'Crimson Legionnaires II', 'Letani Warriors II', 'Yin Spinner',
    'Transparasteel Plating', 'Hybrid Crystal Fighter II', 'Supercharge',
    'Genetic Recombination', 'Yin Spinner',
  ],
  yellow: [
    'Sarween Tools', 'Dacxive Animators', 'Scanlink Drone Network',
    'AI Development Algorithm', 'Psychoarchaeology', 'Production Biomes',
    'Quantum Datahub Node', 'Inheritance Systems', 'Salvage Operations',
    'L4 Disruptors', 'Magmus Reactor', 'Spacial Conduit Cylinder',
  ],
}

// ─── Rules Reference ──────────────────────────────────────────────────────────

export const RULES = [
  {
    topic: 'Round Structure',
    content: 'Each round: Strategy Phase → Action Phase → Status Phase → Agenda Phase. Agenda phase skipped until Custodians Token removed from Mecatol Rex.',
  },
  {
    topic: 'Strategy Phase',
    content: 'Speaker picks first, then clockwise. Unchosen cards each gain 1 trade good. 3–4 player games: each player picks 2 strategy cards.',
  },
  {
    topic: 'Action Phase',
    content: 'Players take turns in initiative order (lower card number = earlier). Each turn: 1 action (Strategic, Tactical, or Component). Cannot pass until strategic action performed (3–4 players: both cards exhausted). Passed players may still: resolve secondaries; perform 1 transaction.',
  },
  {
    topic: 'Status Phase',
    content: '(1) Score objectives (1 public + 1 secret max). (2) Reveal next public objective. (3) Draw 1 action card each. (4) Remove command tokens from board. (5) Gain 2 command tokens, redistribute. (6) Ready all exhausted cards. (7) Repair damaged units. (8) Return strategy cards.',
  },
  {
    topic: 'Agenda Phase',
    content: 'Resolve 2 agendas per round: Reveal → Vote → Resolve. Vote by exhausting planets (votes = influence). Cannot split votes or use trade goods for votes. Ties: speaker decides. Laws stay permanently; directives discard.',
  },
  {
    topic: 'Ability Timing',
    content: '"When" = at the moment of the event; may modify it. "After" = immediately after it resolves. "When" takes priority over "After". "Cannot" is absolute and cannot be overridden.',
  },
  {
    topic: 'Transactions',
    content: 'Only between neighbors (ships or planets in adjacent systems). 1 transaction per turn. Can exchange: commodities, trade goods, promissory notes, relic fragments. Commodities convert to trade goods when received. Verbal deals are not binding.',
  },
  {
    topic: 'Command Tokens',
    content: 'Tactic pool: activate systems. Fleet pool: limits non-fighter ships per system. Strategy pool: secondary ability of strategy cards. Status phase: remove from board, gain 2, redistribute freely.',
  },
  {
    topic: 'Space Combat',
    content: 'Rounds: (1) Anti-Fighter Barrage → (2) Announce Retreat → (3) Roll Dice → (4) Assign Hits → (5) Retreat. Each ship hits on result ≥ combat value. Attacker assigns hits first, then defender. Sustain Damage: place damage token instead of destroying (once per ship).',
  },
  {
    topic: 'Production',
    content: 'Space Docks: Production = planet resource value + 2. Total cost of produced units cannot exceed Production value. Blockaded Space Docks (no friendly ships, enemy ships present): can produce ground forces only.',
  },
  {
    topic: 'Victory',
    content: 'First player to reach VP goal wins immediately. Default goal: 10 VP (optional: 14 VP). Exception — Civilized Society galactic event: game ends at end of status phase; most VPs wins; ties broken by total influence + unspent trade goods.',
  },
  {
    topic: 'TE: Expedition',
    content: 'Thunder\'s Edge starts off-board. At end of turn, claim an unclaimed slice by paying its cost: Spend 5 Resources / Discard 2 Action Cards / Spend 5 Influence / Discard 1 Unscored Secret / Exhaust 1 Tech Specialty Planet / Spend 3 Trade Goods. First slice claimed = gain Breakthrough.',
  },
  {
    topic: 'TE: Breakthroughs',
    content: 'Faction-specific ability card. Grants Synergy between 2 tech colours (treat one as the other for research/objectives). On gaining: roll 1 die — on 1 or 10, The Fracture enters play.',
  },
  {
    topic: 'TE: The Fracture',
    content: 'Separate region, not adjacent to main galaxy. Access via Ingress Tokens in main-board systems with matching tech specialties. Contains planets with relic icons. Styx is legendary and grants 1 VP while held. Neutral units guard it.',
  },
  {
    topic: 'TE: Entropic Scars',
    content: 'New anomaly type. Unit abilities cannot be used by or against units inside. Wormholes placed inside are discarded. Start of status phase: player with ships here may spend 1 strategy pool token to gain a faction technology.',
  },
  {
    topic: 'TE: Space Stations',
    content: 'Cannot have ground forces; not a planet for objectives or voting. Controlled when only your ships are in the space area. +1 commodity value while controlled. Can exhaust to convert commodities to trade goods.',
  },
  {
    topic: 'TE: Neutral Units',
    content: 'Non-player forces in The Fracture. Speaker makes decisions for them. Hits assigned in reference card order. Always use unit abilities (Sustain Damage, Space Cannon, etc.). Count as "other players\' units" for ability resolution.',
  },
]
