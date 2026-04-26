# component-StrategyCardPanel

**File:** `src/components/game/StrategyCardPanel.jsx`
**Status:** New
**Prereqs:** hook-useStrategyCards

## Functionality

```pseudocode
props: { player, game, allPlayers, activePay, isActive, onPickStrategyCard, onPlayPrimary }

IF game.phase === 'strategy':
  IF player.strategy_card is null:
    render available card numbers (1–8 minus cards held by other players)
    each card: show number + name; onClick → onPickStrategyCard(cardNumber)
  ELSE:
    render "Card {player.strategy_card} selected" (read-only until phase advances)

IF game.phase === 'action':
  IF player.strategy_card is null: render nothing
  ELSE IF activePay exists: render "Card {activePay.card_number} is active" (no button)
  ELSE IF isActive:
    render "PLAY STRATEGY CARD" btn-primary → onPlayPrimary()
  ELSE:
    render card number as dim label (not your turn)
```

## Tests

```pseudocode
it('renders card picker during strategy phase when no card picked')
it('renders selected card label during strategy phase when card picked')
it('calls onPickStrategyCard with correct number on card tap')
it('renders PLAY STRATEGY CARD button when action phase, isActive, no activePay')
it('does not render play button when not active player')
it('shows card active label when activePay exists')
it('renders nothing during action phase when player has no strategy card')
```
