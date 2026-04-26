# component-GameScreen

**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useStrategyCards, component-StrategyCardModal

## Changes

```pseudocode
// Add imports:
import { useStrategyCards } from '../../hooks/useStrategyCards.js'
import StrategyCardModal from './StrategyCardModal.jsx'

// Add hook call after existing hooks:
const {
  activePay, responses, isMyTurnToRespond,
  playPrimary, useSecondary, passSecondary,
} = useStrategyCards(game?.id, currentPlayer?.id)

// Add state for production modal:
[productionSystemKey, setProductionSystemKey] = useState(null)

// Wire StrategyCardModal trigger:
// StrategyCardModal opens automatically whenever activePay != null (no extra state needed)

// Pass additional props to MyPanelSection:
<MyPanelSection
  ..existing..
  allPlayers={players}
  activePay={activePay}
  onPlayPrimary={() => {
    // Open ability picker for the primary ability of caller's strategy card
    // (reuses existing AbilityTargetModal pattern for selection-required effects)
    const primaryAbility = allAbilityDefinitions.find(a =>
      a.ability_sources?.some(s =>
        s.source_type === 'strategy_card' &&
        s.source_id === String(currentPlayer.strategy_card) &&
        s.role === 'primary'
      )
    )
    if (primaryAbility) handlePlayAbility(primaryAbility, String(currentPlayer.strategy_card), 'strategy_card')
  }}
/>

// Pass production props to GalaxyTab:
<GalaxyTab
  ..existing..
  onOpenProduction={setProductionSystemKey}
/>

// Add modals at bottom of return:
{activePay && (
  <StrategyCardModal
    activePay={activePay}
    responses={responses}
    myPlayerId={currentPlayer?.id}
    players={players}
    abilityDefs={allAbilityDefinitions}
    isMyTurnToRespond={isMyTurnToRespond}
    onUseSecondary={(abilityId, selections) => useSecondary(abilityId, selections)}
    onPassSecondary={passSecondary}
    onClose={() => {/* card holder dismisses — no state needed, modal hides when play completes */}}
  />
)}

{productionSystemKey && (
  <ProductionModal
    gameId={game?.id}
    systemKey={productionSystemKey}
    systemUnits={galaxyState.systemUnits}
    myPlanets={planets.filter(p => p.player_id === currentPlayer?.id)}
    unitDefs={unitDefs}  // fetch on mount same pattern as technologies
    onProduce={async (payload) => { await produceUnits(...payload); setProductionSystemKey(null) }}
    onClose={() => setProductionSystemKey(null)}
  />
)}
```

## Tests

```pseudocode
it('calls useStrategyCards with game id and current player id')
it('renders StrategyCardModal when activePay is not null')
it('does not render StrategyCardModal when activePay is null')
it('renders ProductionModal when productionSystemKey is set')
it('clears productionSystemKey on production success and on close')
```
