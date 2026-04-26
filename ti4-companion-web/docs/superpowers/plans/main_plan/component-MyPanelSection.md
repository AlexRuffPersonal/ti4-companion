# component-MyPanelSection

**File:** `src/components/game/MyPanelSection.jsx`
**Status:** Modify
**Prereqs:** component-StrategyCardPanel

## Changes

Replace the bare strategy card number display with `StrategyCardPanel`:

```pseudocode
// Add to imports:
import StrategyCardPanel from './StrategyCardPanel.jsx'

// Add to props:
props: { ..existing.., allPlayers, activePay, onPlayPrimary }

// Replace existing strategy card number display (wherever it renders player.strategy_card)
// with:
<StrategyCardPanel
  player={player}
  game={game}
  allPlayers={allPlayers}
  activePay={activePay}
  isActive={isActive}
  onPickStrategyCard={onPickStrategyCard}
  onPlayPrimary={onPlayPrimary}
/>
```

## Tests

```pseudocode
it('renders StrategyCardPanel with correct props')
it('passes activePay through to StrategyCardPanel')
// Existing MyPanelSection tests should still pass (regression)
```
