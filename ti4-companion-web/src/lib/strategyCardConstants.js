export const STRATEGY_CARDS = {
  1: {
    number: 1,
    name: 'Leadership',
    initiative: 1,
    primaryText: 'Gain 3 command tokens. Spend any amount of influence to gain 1 command token per 3 influence spent.',
    secondaryText: 'Spend any amount of influence to gain 1 command token per 3 influence spent.',
    primaryFields: [
      { key: 'influence_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets for influence (optional)', required: false },
      { key: 'token_pool', type: 'pool_select', label: 'Add bonus tokens to pool', required: false, default: 'tactic_total' },
    ],
    secondaryFields: [
      { key: 'influence_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets for influence', required: false },
      { key: 'token_pool', type: 'pool_select', label: 'Add tokens to pool', required: false, default: 'tactic_total' },
    ],
  },
  2: {
    number: 2,
    name: 'Diplomacy',
    initiative: 2,
    primaryText: 'Place a command token from your reinforcements in any system that contains a planet you own. Then choose 2 of your planets and ready them.',
    secondaryText: 'Choose up to 2 of your planets and ready them.',
    primaryFields: [
      { key: 'target_system_coords', type: 'system_select', label: 'Place token in system', required: true },
      { key: 'planets_to_ready', type: 'planet_multiselect', label: 'Ready up to 2 planets (optional)', required: false },
    ],
    secondaryFields: [
      { key: 'planets_to_ready', type: 'planet_multiselect', label: 'Ready up to 2 planets', required: false },
    ],
  },
  3: {
    number: 3,
    name: 'Politics',
    initiative: 3,
    primaryText: 'Choose a player to become the new speaker. Draw 2 action cards. Look at the top 2 cards of the agenda deck and place them back in any order.',
    secondaryText: 'Draw 2 action cards.',
    primaryFields: [
      { key: 'new_speaker_player_id', type: 'player_select', label: 'New speaker', required: true },
      { key: 'ordered_card_ids', type: 'agenda_reorder', label: 'Reorder top 2 agenda cards', required: true },
    ],
    secondaryFields: [],
  },
  4: {
    number: 4,
    name: 'Construction',
    initiative: 4,
    primaryText: 'Place 1 PDS or 1 space dock on a planet you control. Place 1 PDS on a planet you control.',
    secondaryText: 'Spend 1 command token from your strategy pool. Place a command token from your reinforcements in any system that contains 1 of your ships. Then place 1 PDS or 1 space dock on a planet in that system you control.',
    primaryFields: [
      { key: 'structures', type: 'planet_multiselect_pair', label: 'Place structures (up to 2)', required: true },
    ],
    secondaryFields: [
      { key: 'system_coords', type: 'system_select', label: 'System with your ships', required: true },
      { key: 'planet_id', type: 'planet_select', label: 'Planet for structure', required: true },
      { key: 'unit_type', type: 'unit_type_radio', label: 'Structure type', required: true },
    ],
  },
  5: {
    number: 5,
    name: 'Trade',
    initiative: 5,
    primaryText: 'Gain 3 trade goods. Replenish your commodities. Choose up to 3 players. Those players replenish their commodities. Replenish means to set commodities equal to commodity capacity.',
    secondaryText: 'Replenish your commodities.',
    primaryFields: [
      { key: 'free_secondary_player_ids', type: 'player_multiselect', label: 'Grant free secondary to players (optional)', required: false },
    ],
    secondaryFields: [],
  },
  6: {
    number: 6,
    name: 'Warfare',
    initiative: 6,
    primaryText: 'Remove 1 of your command tokens from the board and return it to your reinforcements. Redistribute your command tokens among your tactic, fleet, and strategy pools.',
    secondaryText: 'Produce units in your home system up to your production capacity.',
    primaryFields: [
      { key: 'remove_from_system_coords', type: 'system_select', label: 'Remove token from system', required: true },
      { key: 'remove_to_pool', type: 'pool_select', label: 'Return to pool', required: false, default: 'tactic_total' },
      { key: 'redistribution_tactic', type: 'number', label: 'Tactic tokens', required: true },
      { key: 'redistribution_fleet', type: 'number', label: 'Fleet tokens', required: true },
      { key: 'redistribution_strategy', type: 'number', label: 'Strategy tokens', required: true },
    ],
    secondaryFields: [],
  },
  7: {
    number: 7,
    name: 'Technology',
    initiative: 7,
    primaryText: 'Research 1 technology. You may research an additional technology by spending 6 resources.',
    secondaryText: 'Spend 1 command token from your strategy pool and 4 resources to research 1 technology.',
    primaryFields: [
      { key: 'tech_1_id', type: 'tech_select', label: 'Research technology', required: true },
      { key: 'tech_2_id', type: 'tech_select', label: 'Research 2nd technology (spend 6 resources)', required: false },
      { key: 'tech_2_resource_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets for 2nd tech (optional)', required: false },
      { key: 'tech_2_trade_goods', type: 'number', label: 'Trade goods for 2nd tech', required: false },
    ],
    secondaryFields: [
      { key: 'tech_id', type: 'tech_select', label: 'Research technology', required: true },
      { key: 'tech_resource_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets (need 4 resources)', required: false },
      { key: 'tech_trade_goods', type: 'number', label: 'Trade goods to spend', required: false },
    ],
  },
  8: {
    number: 8,
    name: 'Imperial',
    initiative: 8,
    primaryText: 'Score 1 public objective if you are eligible. If you control Mecatol Rex, gain 1 VP; otherwise draw 1 secret objective.',
    secondaryText: 'Spend 1 command token from your strategy pool to draw 1 secret objective.',
    primaryFields: [
      { key: 'public_objective_id', type: 'objective_select', label: 'Score public objective (optional)', required: false },
    ],
    secondaryFields: [],
  },
}

export function getCard(number) {
  return STRATEGY_CARDS[number] ?? null
}
