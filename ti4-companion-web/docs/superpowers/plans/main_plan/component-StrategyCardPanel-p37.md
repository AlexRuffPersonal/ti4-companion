# component-StrategyCardPanel-p37
**File:** `src/components/game/StrategyCardPanel.jsx`
**Status:** Modify
**Prereqs:** lib-strategyCardConstants, hook-useStrategyCards-p37

## Changes

```pseudocode
IMPORT getCard from strategyCardConstants

// Action phase — play button: show card name
IF isActive AND no activePay:
  card = getCard(player.strategy_card)
  render btn-primary "PLAY {card.name.toUpperCase()}" → onPlayPrimary()

// Action phase — card held but not active turn: show name + initiative
IF not isActive AND player.strategy_card !== null AND no activePay:
  card = getCard(player.strategy_card)
  render LABEL("{card.initiative}. {card.name}") dim

// Action phase — activePay exists: show card name instead of number
IF activePay:
  activeCard = getCard(activePay.card_number)
  render LABEL("{activeCard?.name ?? activePay.card_number} is active") dim

// Strategy phase — card selected: show name
IF game.phase === 'strategy' AND player.strategy_card !== null:
  card = getCard(player.strategy_card)
  render LABEL("{card.initiative}. {card.name} selected") dim

// Strategy phase — picker: already shows name per button (unchanged)
```

No new props needed.

## Tests

```pseudocode
it('play button shows card name in action phase')
it('dim label shows initiative + name when not active turn')
it('activePay label shows card name')
it('strategy phase selected label shows initiative + name')
```
