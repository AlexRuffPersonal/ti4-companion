# hook-useTechnologies

**File:** `src/hooks/useTechnologies.js`
**Status:** New
**Prereqs:** client-edgeFunctions-p30

## Functionality

```pseudocode
export function useTechnologies(player, gameId) {
  // player row already contains technologies[] and exhausted_technologies[]
  // via Realtime subscription in useGame

  ownedTechnologies = player?.technologies ?? []
  exhaustedTechnologies = player?.exhausted_technologies ?? []

  isExhausted = (name) => exhaustedTechnologies.includes(name)

  exhaustTech = (name) => exhaustTechnology(gameId, name)
  readyTech = (name) => readyTechnology(gameId, name)
  useTechAction = (name, selections) => useTechnologyAction(gameId, name, selections)

  return { ownedTechnologies, exhaustedTechnologies, isExhausted, exhaustTech, readyTech, useTechAction }
}
```

## Tests

```pseudocode
GIVEN player.exhausted_technologies=['Graviton Laser System']
  isExhausted('Graviton Laser System') === true
  isExhausted('Bio-Stims') === false
GIVEN player=null EXPECT ownedTechnologies=[] and exhaustedTechnologies=[]
exhaustTech calls exhaustTechnology with correct gameId and name
```
