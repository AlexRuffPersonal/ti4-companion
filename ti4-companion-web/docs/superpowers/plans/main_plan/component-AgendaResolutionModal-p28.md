# component-AgendaResolutionModal-p28
**File:** `src/components/game/AgendaResolutionModal.jsx`
**Status:** Modify
**Prereqs:** —

## Changes

```pseudocode
// Current: agenda.note rendered only inside the isNonTractable block.
// Change: render note for ALL agendas; keep the warning label gated on isNonTractable.

// Replace the isNonTractable block with two separate blocks:
{agenda?.note && (
  <div className="panel-inset">
    <p data-testid="agenda-note" className="text-xs text-muted">{agenda.note}</p>
  </div>
)}

{isNonTractable && (
  <div className="panel-inset">
    <p className="label text-xs text-warning">HOST APPLIES MANUALLY</p>
    <p className="text-xs text-muted mt-1">Apply this law's effect manually before confirming.</p>
  </div>
)}
```

## Tests

```pseudocode
it('renders note for all agendas when agenda.note is non-empty')
it('renders HOST APPLIES MANUALLY warning only for non-tractable laws')
it('non-tractable law with note: both note and warning rendered')
it('tractable agenda with note: note rendered, no warning')
it('agenda with null note: no note paragraph')
```
