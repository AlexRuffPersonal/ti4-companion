# component-DiscardBrowserModal
**File:** `src/components/game/DiscardBrowserModal.jsx`
**Status:** New
**Prereqs:** client-edgeFunctions-p42

## Functionality
```pseudocode
props: { open, cards[], maxSelect=3, onConfirm(cardIds[]), onClose }

if !open → return null

MODAL_WRAPPER:
  PANEL(md):
    LABEL("Choose up to {maxSelect} Action Cards")
    scrollable list:
      for each card:
        row: checkbox, card.name (bold), MUTED(card.text)
        checkbox disabled if !selected AND selectedIds.length >= maxSelect
    footer:
      btn ghost "Cancel" → onClose
      btn primary "Take Selected ({selectedIds.length})"
        disabled if selectedIds.length === 0
        onClick → onConfirm(selectedIds)
```

## Tests
```pseudocode
it('renders null when not open')
it('renders all cards with name and text')
it('allows selecting up to maxSelect cards')
it('disables unselected cards when maxSelect reached')
it('calls onConfirm with selected card ids')
it('calls onClose on Cancel')
it('Confirm button disabled when nothing selected')
```
