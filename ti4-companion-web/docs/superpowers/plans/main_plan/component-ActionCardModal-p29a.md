# component-ActionCardModal-p29a
**File:** `src/components/game/ActionCardModal.jsx`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p29a

## Changes

```pseudocode
// Receive new props: onPlayCard(cardId, selections), isMyTurn
// (existing props: cards, onDiscard, onClose)

// Per-card row: add Play button alongside existing Discard button
{card.ability !== null && card.timing?.startsWith('Action:') && isMyTurn && (
  <button
    data-testid={`play-card-${card.id}`}
    className="btn-primary text-xs"
    onClick={() => setPlayingCard(card)}
  >
    Play
  </button>
)}
{(!card.ability || !card.timing?.startsWith('Action:')) && (
  <span className="text-dim text-xs">Not yet enforced</span>
)}

// SelectionsModal (inline within ActionCardModal):
// shown when playingCard is set; renders input fields based on card.ability's
// required selections (derived from op types present in ability array)
// On confirm: calls onPlayCard(playingCard.id, collectedSelections)
// On cancel: clears playingCard
```

## Tests

```pseudocode
it('shows Play button for Action: card with non-null ability when isMyTurn=true')
it('hides Play button when isMyTurn=false')
it('shows "Not yet enforced" label for card with null ability')
it('shows "Not yet enforced" label for non-Action: timing card')
it('clicking Play sets playingCard and shows selections form')
it('confirming selections calls onPlayCard with card id and selections')
it('canceling selections form clears playingCard')
```
