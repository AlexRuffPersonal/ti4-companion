# component-StrategyCardModal-p37
**File:** `src/components/game/StrategyCardModal.jsx`
**Status:** Modify
**Prereqs:** lib-strategyCardConstants, hook-useStrategyCards-p37, component-StrategyCardPanel-p37

## Changes

### New sub-component: StrategyCardPrimaryForm
Rendered inside StrategyCardPanel (not the modal) when isActive and the player is about to play
their primary. Props: `{ cardNumber, myPlayer, allPlayers, game, onSubmit, onCancel }`.

```pseudocode
card = getCard(cardNumber)
selections = useState({})

render card face header: LABEL(card.name), MUTED("Initiative {card.initiative}"),
  MUTED(card.primaryText)

// Render form fields from card.primaryFields:
FOR each field in card.primaryFields:
  switch field.type:
    'planet_multiselect': render checkboxes from myPlayer exhausted/readied planets
    'pool_select': render radio tactic/fleet/strategy
    'player_select': render radio buttons from allPlayers (excluding current speaker for Politics)
    'system_select': render system hex picker (see below)
    'planet_select': render select from myPlayer planets
    'unit_type_radio': render PDS / Space Dock radio
    'tech_select': render TechPicker (existing component if available, else inline list)
    'objective_select': render list of eligible public objectives (passed as prop)
    'player_multiselect': render checkboxes from allPlayers
    'redistribution_sliders': render 3 number inputs (tactic, fleet, strategy) with live sum display
    'planet_multiselect_pair': render 2 sets of (planet_select + unit_type_radio) for Construction

// For Politics — show agendaPeekCards post-submit as read-only confirmation banner
IF cardNumber === 3 AND agendaPeekCards:
  render "Top agenda cards: {card1.name}, {card2.name}" confirmation

render btn-primary "PLAY PRIMARY" onClick → onSubmit(selections)
render btn-ghost "CANCEL" onClick → onCancel()
```

### StrategyCardSecondaryForm
Rendered inside StrategyCardModal when isMyTurnToRespond.

```pseudocode
card = getCard(activePay.card_number)
// render card.secondaryText description
// render secondary fields (similar field rendering for card.secondaryFields)
// For Warfare — after use, if warfareHomeSystemKey show ProductionModal trigger button
render btn-primary "USE SECONDARY" → onUseSecondary(secondarySelections)
render btn-ghost "PASS" → onPassSecondary()
```

### StrategyCardModal updates

```pseudocode
ADD card face header to modal (always visible):
  card = getCard(activePay.card_number)
  LABEL("{card.name} (Initiative {card.initiative})")
  MUTED(card.primaryText)   // primary text always shown as reference
  MUTED("Secondary: {card.secondaryText}")

REPLACE current generic secondary form with StrategyCardSecondaryForm
Card-holder view (response list + CLOSE) unchanged
```

## Tests

```pseudocode
it('card face header rendered with name, initiative, primary text, secondary text')
it('StrategyCardPrimaryForm renders correct fields for each of 8 cards')
it('StrategyCardSecondaryForm renders correct fields for each secondary')
it('Politics form shows agendaPeekCards confirmation after submit')
it('Warfare secondary shows home_system_key production trigger when returned')
it('onSubmit called with correct selections shape per card')
```
