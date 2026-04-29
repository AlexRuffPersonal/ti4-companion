# component-ActionWindowBanner
**File:** `src/components/game/ActionWindowBanner.jsx`
**Status:** New
**Prereqs:** client-edgeFunctions-p29a

## Functionality

Displays a dismissible prompt when a game-level action card window is open and the current player is eligible to respond. Sourced from `game.pending_action_window` (available via the existing `useGame` Realtime subscription).

```pseudocode
props: { window, currentPlayerId, myCards, onPlayCard, onPass, loading }
// window = game.pending_action_window (null or object)
// myCards = player's held action cards

const WINDOW_LABELS = {
  when_agenda_revealed:        'An agenda has been revealed',
  after_speaker_votes:         'The speaker has voted',
  when_voting_begins:          'Voting is about to begin',
  after_technology_researched: 'A player researched a technology',
}

isEligible = window && currentPlayerId IN window.eligible_player_ids
             && currentPlayerId NOT IN window.passed_player_ids
if !isEligible: return null

matchingCards = myCards.filter(c => c.timing === TIMING_MAP[window.type] && c.ability != null)

return (
  MODAL_WRAPPER (z-index below combat modal, above game screen)
    PANEL(sm)
      LABEL(WINDOW_LABELS[window.type])
      MUTED('Play a card or pass')
      {matchingCards.map(card => (
        <button data-testid={`window-play-${card.id}`} className="btn-ghost text-sm w-full text-left"
          onClick={() => onPlayCard(card.id, {})}>
          {card.name}
        </button>
      ))}
      <button data-testid="window-pass" className="btn-ghost text-sm" onClick={onPass}
        disabled={loading}>
        Pass
      </button>
)
```

`TIMING_MAP` mirrors the constant defined in the Edge Function (same key→timing mapping).

## Tests

```pseudocode
it('renders null when window is null')
it('renders null when currentPlayerId not in eligible_player_ids')
it('renders null when currentPlayerId already in passed_player_ids')
it('renders banner with window label when player is eligible')
it('lists only cards matching the window timing with non-null ability')
it('clicking a card calls onPlayCard with card id')
it('clicking Pass calls onPass')
it('Pass button disabled when loading=true')
```
