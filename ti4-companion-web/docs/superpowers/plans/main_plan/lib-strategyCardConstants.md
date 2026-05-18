# lib-strategyCardConstants
**File:** `src/lib/strategyCardConstants.js`
**Status:** New
**Prereqs:** —

## Functionality

```pseudocode
export STRATEGY_CARDS = {
  1: {
    number: 1, name: 'Leadership', initiative: 1,
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
  2: { name: 'Diplomacy', initiative: 2, primaryText: '...', secondaryText: '...', primaryFields: [...], secondaryFields: [...] },
  3: { name: 'Politics',   initiative: 3, ... },
  4: { name: 'Construction', initiative: 4, ... },
  5: { name: 'Trade',      initiative: 5, ... },
  6: { name: 'Warfare',    initiative: 6, ... },
  7: { name: 'Technology', initiative: 7, ... },
  8: { name: 'Imperial',   initiative: 8, ... },
}

export function getCard(number) { return STRATEGY_CARDS[number] ?? null }
```

Field types: `planet_multiselect`, `pool_select`, `player_select`, `system_select`,
`planet_select`, `unit_type_radio`, `tech_select`, `objective_select`, `player_multiselect`,
`redistribution_sliders` (tactic+fleet+strategy, sum display).

## Tests

```pseudocode
it('getCard returns correct entry for each of 1-8')
it('getCard returns null for unknown number')
it('all 8 cards have primaryText, secondaryText, primaryFields, secondaryFields')
```
