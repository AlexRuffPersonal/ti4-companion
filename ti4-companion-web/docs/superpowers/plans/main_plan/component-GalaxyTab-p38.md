# component-GalaxyTab-p38

**File:** `src/components/game/GalaxyTab.jsx`
**Status:** Modify
**Prereqs:** component-SystemActionModal-p38, component-GalaxyTab-p35

## Changes

### Add supabase import and new props

```pseudocode
import { supabase } from '../../lib/supabase.js'

// Add to destructured props:
props: { ...existing, onOpenProduction }
// (onOpenProduction is already passed from GameScreen; just needs destructuring)
```

### Derive myPlanets from existing props

```pseudocode
// Inside GalaxyTab, after existing derivations:
const myPlanets = (allPlanets ?? []).filter(p => p.player_id === currentPlayer?.id)
```

### Fetch frontier token state for active system

```pseudocode
[activeSystemHasFrontierToken, setActiveSystemHasFrontierToken] = useState(false)

useEffect(() => {
  if (!activeSystemKey || !gameId) {
    setActiveSystemHasFrontierToken(false)
    return
  }
  supabase
    .from('game_system_state')
    .select('has_frontier_token')
    .eq('game_id', gameId)
    .eq('system_key', activeSystemKey)
    .maybeSingle()
    .then(({ data }) => setActiveSystemHasFrontierToken(data?.has_frontier_token ?? false))
}, [activeSystemKey, gameId])

const hasDarkEnergyTap = (currentPlayer?.technologies ?? []).includes('Dark Energy Tap')
```

### Handle frontier exploration callback

```pseudocode
async function handleExploreFrontier(systemKey) {
  try {
    const result = await exploration.exploreFrontier(systemKey)
    if (result?.card_name) {
      setSelectedPlanet({ planet_name: null, isFrontier: true, card_name: result.card_name })
      setShowExplorationModal(true)
    }
  } catch (e) {
    console.error('Frontier explore error:', e)
  }
}
```

### Pass new props to SystemActionModal

```pseudocode
<SystemActionModal
  ...existingProps
  myPlanets={myPlanets}
  systemUnits={systemUnits}
  unitDefs={unitDefs}
  onOpenProduction={onOpenProduction}
  hasFrontierToken={activeSystemHasFrontierToken}
  hasDarkEnergyTap={hasDarkEnergyTap}
  onExploreFrontier={handleExploreFrontier}
/>
```

## Tests

```pseudocode
// tests/components/game/GalaxyTab.test.jsx additions
// (SystemActionModal mock needs to expose hasFrontierToken, hasDarkEnergyTap, onExploreFrontier)

it('passes hasFrontierToken=true to SystemActionModal when active system has_frontier_token')
it('passes hasDarkEnergyTap=true to SystemActionModal when currentPlayer has Dark Energy Tap')
it('passes myPlanets derived from allPlanets filtered by currentPlayer.id')
it('calls exploration.exploreFrontier and opens ExplorationModal on handleExploreFrontier')
```
