export type Op = Record<string, unknown>

export const EXPLORATION_EFFECTS: Record<string, Op[]> = {
  // Industrial deck
  'Abandoned Warehouses':      [{ op:'choice', options:[ [{op:'gain_commodities',amount:2}], [{op:'convert_commodities',amount:2}] ] }],
  'Biotic Research Facility':  [{ op:'attach_to_planet', attachment:'Biotic Research Facility' }],
  'Cybernetic Research Facility': [{ op:'attach_to_planet', attachment:'Cybernetic Research Facility' }],
  'Functioning Base':          [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'gain_trade_goods',amount:-1},{op:'draw_action_card',count:1}] ] }],
  'Local Fabricators':         [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'gain_trade_goods',amount:-1},{op:'place_units',unit:'mech',planet:'self',count:1}] ] }],
  'Propulsion Research Facility': [{ op:'attach_to_planet', attachment:'Propulsion Research Facility' }],

  // Cultural deck
  'Cultural Relic Fragment':   [{ op:'gain_relic_fragment', fragment_type:'cultural' }],
  'Demilitarized Zone':        [{ op:'attach_to_planet', attachment:'Demilitarized Zone' }],
  'Dyson Sphere':              [{ op:'attach_to_planet', attachment:'Dyson Sphere' }],
  'Freelancers':               [{ op:'place_units', unit:'any', planet:'self', count:1, spend_influence_as_resources:true }],
  'Mercenary Outfit':          [{ op:'place_units', unit:'infantry', planet:'self', count:1, optional:true }],
  'Paradise World':            [{ op:'attach_to_planet', attachment:'Paradise World' }],
  'Tomb Of Emphidia':          [{ op:'attach_to_planet', attachment:'Tomb Of Emphidia' }],

  // Hazardous deck
  'Core Mine':                 [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_trade_goods',amount:1}] }],
  'Expedition':                [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_planets',count:1,planets:'self'}] }],
  'Hazardous Relic Fragment':  [{ op:'gain_relic_fragment', fragment_type:'hazardous' }],
  'Industrial Relic Fragment': [{ op:'gain_relic_fragment', fragment_type:'industrial' }],
  'Lazax Survivors':           [{ op:'attach_to_planet', attachment:'Lazax Survivors' }],
  'Mining World':              [{ op:'attach_to_planet', attachment:'Mining World' }],
  'Rich World':                [{ op:'attach_to_planet', attachment:'Rich World' }],
  'Volatile Fuel Source':      [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_tokens',amount:1}] }],
  'Warfare Research Facility': [{ op:'attach_to_planet', attachment:'Warfare Research Facility' }],

  // Frontier deck
  'Derelict Vessel':           [{ op:'draw_secret_objective' }],
  'Enigmatic Device':          [{ op:'gain_relic_fragment', fragment_type:'enigmatic_device', keep_card:true }],
  'Gamma Relay':               [{ op:'place_map_token', token_type:'gamma_wormhole' }],
  'Ion Storm':                 [{ op:'place_map_token', token_type:'ion_storm' }],
  'Lost Crew':                 [{ op:'draw_action_card', count:2 }],
  'Merchant Station':          [{ op:'choice', options:[ [{op:'gain_commodities',amount:'max'}], [{op:'convert_commodities',amount:'all'}] ] }],
  'Mirage':                    [{ op:'place_mirage' }],
  'Unknown Relic Fragment':    [{ op:'gain_relic_fragment', fragment_type:'unknown' }],
  'Gamma Wormhole':            [{ op:'place_map_token', token_type:'gamma_wormhole' }],
}
