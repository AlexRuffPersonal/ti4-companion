export type Op = Record<string, unknown>

export const EXPLORATION_EFFECTS: Record<string, Op[]> = {
  // Industrial deck
  'Abandoned Warehouses':      [{ op:'choice', options:[ [{op:'gain_commodities',amount:2}], [{op:'convert_commodities',amount:2}] ] }],
  'Biotic Research Facility':  [{ op:'attach_to_planet', attachment:'Biotic Research Facility' }],
  'Cybernetic Research Facility': [{ op:'attach_to_planet', attachment:'Cybernetic Research Facility' }],
  'Functioning Base':          [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'draw_action_card',count:1}], [{op:'spend_commodities',amount:1},{op:'draw_action_card',count:1}] ] }],
  'Local Fabricators':         [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'place_mech_on_current_planet'}], [{op:'spend_commodities',amount:1},{op:'place_mech_on_current_planet'}] ] }],
  'Propulsion Research Facility': [{ op:'attach_to_planet', attachment:'Propulsion Research Facility' }],

  // Cultural deck
  'Cultural Relic Fragment':   [{ op:'gain_relic_fragment', fragment_type:'cultural' }],
  'Demilitarized Zone':        [{op:'clear_planet_units_and_structures'},{op:'attach_to_planet',attachment:'Demilitarized Zone'}],
  'Dyson Sphere':              [{ op:'attach_to_planet', attachment:'Dyson Sphere' }],
  'Freelancers':               [{op:'freelancers_produce'}],
  'Mercenary Outfit':          [{ op:'place_units', unit:'infantry', planet:'self', count:1, optional:true }],
  'Paradise World':            [{ op:'attach_to_planet', attachment:'Paradise World' }],
  'Tomb Of Emphidia':          [{op:'attach_to_planet',attachment:'Tomb Of Emphidia'},{op:'gain_named_relic',name:'Crown of Emphidia'}],

  // Hazardous deck
  'Core Mine':                 [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_trade_goods',amount:1}] }],
  'Expedition':                [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_current_planet'}] }],
  'Hazardous Relic Fragment':  [{ op:'gain_relic_fragment', fragment_type:'hazardous' }],
  'Industrial Relic Fragment': [{ op:'gain_relic_fragment', fragment_type:'industrial' }],
  'Lazax Survivors':           [{ op:'attach_to_planet', attachment:'Lazax Survivors' }],
  'Mining World':              [{ op:'attach_to_planet', attachment:'Mining World' }],
  'Rich World':                [{ op:'attach_to_planet', attachment:'Rich World' }],
  'Volatile Fuel Source':      [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_token_choice'}] }],
  'Warfare Research Facility': [{ op:'attach_to_planet', attachment:'Warfare Research Facility' }],

  // Frontier deck
  'Derelict Vessel':           [{ op:'draw_secret_objective' }],
  'Enigmatic Device':          [{op:'hold_card'}],
  'Gamma Relay':               [{ op:'place_map_token', token_type:'gamma_wormhole' }],
  'Ion Storm':                 [{ op:'place_map_token', token_type:'ion_storm' }],
  'Lost Crew':                 [{ op:'draw_action_card', count:2 }],
  'Merchant Station':          [{ op:'choice', options:[ [{op:'replenish_commodities',target:'self'}], [{op:'convert_all_commodities'}] ] }],
  'Mirage':                    [{ op:'place_mirage' }],
  'Unknown Relic Fragment':    [{ op:'gain_relic_fragment', fragment_type:'unknown', keep_card:true }],
  'Gamma Wormhole':            [{ op:'place_map_token', token_type:'gamma_wormhole' }],
}
