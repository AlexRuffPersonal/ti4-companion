# component-EndTurnDialog

**File:** `src/components/game/EndTurnDialog.jsx`
**Status:** New
**Prereqs:** hook-useLegendaryCards, component-LegendaryCardPanel

## Functionality

```pseudocode
props: { myCards, exhaustCard, onConfirmEndTurn, onClose }
// onConfirmEndTurn: calls game-end-turn
// Shown by parent (e.g. GameScreen) when active player clicks "End Turn"
// and myCards.some(c => c.status === 'readied')

readiedCards = myCards.filter(c => c.status === 'readied')

if readiedCards.length === 0:
  // Parent should call onConfirmEndTurn directly; dialog shouldn't render
  return null

MODAL_WRAPPER:
  PANEL(md):
    LABEL("End of Turn — Legendary Abilities")
    MUTED("You may exhaust any of these cards before ending your turn.")
    for each card in readiedCards:
      div.panel-inset:
        row: card name + ability text (same lookup as LegendaryCardPanel)
        btn-primary "Use" → exhaustCard(card.planet_name)
          disabled while awaiting response or card already exhausted this session
    row:
      btn-ghost "Skip & End Turn" → onConfirmEndTurn()
      btn-primary "Done, End Turn" → onConfirmEndTurn()
```

## Tests

```pseudocode
it('renders nothing when no readied cards')
it('renders one row per readied card with Use button')
it('calls exhaustCard with planet_name when Use clicked')
it('calls onConfirmEndTurn when Skip clicked')
it('calls onConfirmEndTurn when Done clicked')
it('disables Use button while exhaustCard in flight')
```
