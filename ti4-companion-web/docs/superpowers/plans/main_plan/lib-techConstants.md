# lib-techConstants

**File:** `src/lib/techConstants.js`
**Status:** New
**Prereqs:** —

## Functionality

Client-side mirror of server constants. Drives UI affordances without parsing card text.

```pseudocode
export const EXHAUSTABLE_TECHS = new Set([
  'Graviton Laser System', 'Bio-Stims', 'Magen Defense Grid', 'Supercharge',
  'Predictive Intelligence', 'Transit Diodes', 'Sling Relay',
  'Spacial Conduit Cylinder', 'AI Development Algorithm', 'Self-Assembly Routines',
  'Vortex', 'X-89 Bacterial Weapon', 'Production Biomes', 'Instinct Training',
  'Nullification Field', 'Genetic Recombination', 'Hegemonic Trade Policy',
  'Lazax Gate Folding', 'Mageon Implants', 'Temporal Command Suite',
  'Inheritance Systems'
])

// Techs with "ACTION:" text that can be triggered by the player as an action
export const ACTION_TECHS = new Set([
  'X-89 Bacterial Weapon', 'Production Biomes', 'Sling Relay', 'Vortex',
  'Mageon Implants', 'Lazax Gate Folding', 'Transit Diodes', 'Chaos Mapping'
])
```

## Tests

```pseudocode
EXHAUSTABLE_TECHS.has('Graviton Laser System') === true
EXHAUSTABLE_TECHS.has('Neural Motivator') === false
ACTION_TECHS.has('Sling Relay') === true
```
