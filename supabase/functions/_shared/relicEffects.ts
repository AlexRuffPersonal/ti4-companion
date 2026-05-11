export type Op = Record<string, unknown>

export const RELIC_EFFECTS: Record<string, Op[]> = {
  // ACTION relics
  'Dominus Orb':      [{ op:'dominus_orb_move' }],
  'Maw Of Worlds':    [{ op:'exhaust_all_planets' }, { op:'gain_technology', count:1 }],
  'Stellar Converter':[{ op:'stellar_converter' }],
  'The Codex':        [{ op:'take_from_discard', deck:'action_card', count:3 }],
  'Enigmatic Device': [{ op:'spend_resources', amount:6 }, { op:'gain_technology', count:1 }],

  // Reactive relics
  'Scepter Of Emelpar':  [{ op:'spend_from_reinforcements' }],
  'The Crown Of Thalnos':[{ op:'reroll_combat_dice' }],
  'The Obsidian':        [{ op:'draw_secret_objective' }],
  "The Prophet's Tears": [{ op:'choice', options:[ [{op:'ignore_prerequisite'}], [{op:'draw_action_card',count:1}] ] }],
  'The Crown Of Emphidia':[{ op:'explore_planet', target:'any_controlled' }],
  'Shard Of The Throne': [],
}
