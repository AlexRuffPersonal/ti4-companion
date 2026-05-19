# lib-leaderConstants
**File:** `src/lib/leaderConstants.js`
**Status:** New
**Prereqs:** —

## Functionality
```pseudocode
// Selection requirements for each faction's agent and hero ability UI
// Factions not listed have no selection requirements (simple confirm prompt)
export const LEADER_SELECTION_CONFIG = {
  'The Emirates Of Hacan': {
    agent: {
      needs_choice: true,
      options: ['Gain 2 commodities', 'Replenish another player\'s commodities'],
      // option 1 also needs: needs_target_player: true
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
  'The Winnu': {
    hero: { needs_strategy_card: true },   // Mathis hero: choose strategy card
  },
  'The Naalu Collective': {
    hero: { needs_target_player: true, multi: true },  // Oracle: each player gives 1 note
  },
  // ... all factions that need selections
}
```

## Tests
No automated tests — pure static config. Verified by manual QA of each leader modal.
