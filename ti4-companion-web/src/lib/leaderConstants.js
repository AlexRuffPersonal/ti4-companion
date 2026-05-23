// Selection requirements for each faction's agent and hero ability UI.
// Factions not listed have no selection requirements (simple confirm prompt).
export const LEADER_SELECTION_CONFIG = {
  'The Emirates Of Hacan': {
    agent: {
      needs_choice: true,
      options: ['Gain 2 commodities', "Replenish another player's commodities"],
      option_needs_target_player: [1],
    },
  },
  'The Xxcha Kingdom': {
    agent: { needs_planet: true, planet_filter: 'any' },
  },
  'The Nekro Virus': {
    agent: {
      needs_target_player: true,
      needs_choice: true,
      options: ['Discard 1 action card', 'Spend 1 command token'],
    },
  },
  'The Ghosts Of Creuss': {
    hero: {
      needs_system: true,
      count: 2,
      system_filter: 'has_wormhole_or_your_units',
      exclude: ['creuss_home', 'wormhole_nexus'],
    },
  },
  'The Mahact Gene-Sorcerers': {
    hero: {
      needs_system: true,
      count: 2,
      label: ['Source system', 'Destination system'],
      needs_target_player: true,
    },
  },
  'The Winnu': {
    hero: { needs_strategy_card: true },
  },
  'The Naalu Collective': {
    hero: { needs_target_player: true, multi: true, label: 'Force each player to give a promissory note' },
  },
  'The Yssaril Tribes': {
    hero: { auto_multi_player: true, label: 'Each player reveals 1 action card' },
  },
}
