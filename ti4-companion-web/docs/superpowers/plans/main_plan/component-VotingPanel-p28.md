# component-VotingPanel-p28
**File:** `src/components/game/VotingPanel.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
// Below the agenda name line, add note text:
<p className="text-text font-display text-sm">{agenda?.name}</p>
{agenda?.note && (
  <p data-testid="agenda-note" className="text-dim text-xs leading-snug">
    {agenda.note}
  </p>
)}
```

## Tests

```pseudocode
it('renders agenda note when agenda.note is non-empty')
it('does not render note paragraph when agenda.note is null/empty')
it('note renders below agenda name')
```
