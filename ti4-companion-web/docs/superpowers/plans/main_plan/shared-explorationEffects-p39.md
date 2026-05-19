# shared-explorationEffects-p39
**File:** `supabase/functions/_shared/explorationEffects.ts`
**Status:** Modify
**Prereqs:** shared-explorationEffects, shared-abilityDsl-p39

## Functionality
Nine entries change (see design spec for full rationale):

```pseudocode
// Expedition — use bespoke op instead of broken ready_planets:self
'Expedition': [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_current_planet'}] }]

// Merchant Station — replace broken max/all amounts
'Merchant Station': [{ op:'choice', options:[
  [{op:'replenish_commodities', target:'self'}],
  [{op:'convert_all_commodities'}]
]}]

// Volatile Fuel Source — remove broken bucket-less gain_command_tokens
'Volatile Fuel Source': [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_token_choice'}] }]

// Functioning Base — 3-way choice (commodity | TG spend | commodity spend)
'Functioning Base': [{ op:'choice', options:[
  [{op:'gain_commodities', amount:1}],
  [{op:'spend_trade_goods', amount:1}, {op:'draw_action_card', count:1}],
  [{op:'spend_commodities', amount:1}, {op:'draw_action_card', count:1}]
]}]

// Local Fabricators — 3-way choice (commodity | TG spend | commodity spend)
'Local Fabricators': [{ op:'choice', options:[
  [{op:'gain_commodities', amount:1}],
  [{op:'spend_trade_goods', amount:1}, {op:'place_mech_on_current_planet'}],
  [{op:'spend_commodities', amount:1}, {op:'place_mech_on_current_planet'}]
]}]

// Demilitarized Zone — immediate effect + attach
'Demilitarized Zone': [
  {op:'clear_planet_units_and_structures'},
  {op:'attach_to_planet', attachment:'Demilitarized Zone'}
]

// Tomb Of Emphidia — attach + Crown of Emphidia relic search
'Tomb Of Emphidia': [
  {op:'attach_to_planet', attachment:'Tomb Of Emphidia'},
  {op:'gain_named_relic', name:'Crown of Emphidia'}
]

// Enigmatic Device — not a relic fragment; just held in play area
'Enigmatic Device': [{op:'hold_card'}]

// Freelancers — bespoke mini-production op
'Freelancers': [{op:'freelancers_produce'}]
```

## Tests
No standalone test file — covered through game-explore-planet and game-resolve-exploration-card tests.
