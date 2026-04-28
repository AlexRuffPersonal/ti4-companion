# component-LegendaryCardPanel

**File:** `src/components/game/LegendaryCardPanel.jsx`
**Status:** New
**Prereqs:** hook-useLegendaryCards

## Functionality

```pseudocode
props: { myCards }  // from useLegendaryCards

LEGENDARY_ABILITY_TEXT = {
  primor:     'Exhaust at end of your turn: place up to 2 infantry from reinforcements on any planet you control.',
  hopes_end:  'Exhaust at end of your turn: place 1 mech on any planet you control, or draw 1 action card.',
  mallice:    'Exhaust at end of your turn: gain 2 trade goods, or convert all commodities to trade goods.',
  mirage:     'Exhaust at end of your turn: place up to 2 fighters in any system containing your ships.',
}

LEGENDARY_CARD_NAME = {
  primor:     'The Atrament',
  hopes_end:  'Imperial Arms Vault',
  mallice:    'Exterrix Headquarters',
  mirage:     'Mirage Flight Academy',
}

if myCards.length === 0: return null

render:
  LABEL("Legendary Abilities")
  for each card in myCards:
    div.panel-inset:
      row: LABEL(LEGENDARY_CARD_NAME[card.planet_name]) + readied/exhausted badge
      MUTED(LEGENDARY_ABILITY_TEXT[card.planet_name])
```

## Tests

```pseudocode
it('renders nothing when myCards is empty')
it('renders card name and ability text for each card')
it('shows readied badge when status=readied')
it('shows exhausted badge when status=exhausted')
```
