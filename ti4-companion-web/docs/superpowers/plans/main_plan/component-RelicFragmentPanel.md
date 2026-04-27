# component-RelicFragmentPanel
**File:** `src/components/game/RelicFragmentPanel.jsx`
**Status:** New
**Prereqs:** hook-useExploration

## Functionality
```pseudocode
props: { relicFragments[], isActivePlayer, onUseRelicFragment }

state: { selectedIds: Set<UUID>, showSelector: bool }

// Group fragments by type
grouped = groupBy(relicFragments, f => f.relic_fragment_type)
// types: cultural, hazardous, industrial, unknown

if relicFragments.length === 0 → return null

PANEL(sm):
  LABEL("Relic Fragments")

  for each type in ['cultural','hazardous','industrial','unknown']:
    count = grouped[type]?.length ?? 0
    if count > 0:
      row: type icon + label + count badge

  // Spend button
  btn "Spend Fragments"
    disabled if !isActivePlayer
    disabled if relicFragments.length < 3
    onClick → setShowSelector(true)

  if showSelector:
    // Fragment selector modal
    MODAL_WRAPPER:
      PANEL(sm):
        LABEL("Select 3 fragments to spend")
        for each fragment:
          checkbox → toggle selectedIds

        // Client-side validation
        valid = selectedIds.size === 3
               AND at least 1 typed fragment selected
               AND all selected are same-type-or-unknown
        MUTED(validation hint if !valid)

        btn "Confirm" disabled if !valid
          onClick → onUseRelicFragment([...selectedIds]); setShowSelector(false)
        btn "Cancel" → setShowSelector(false)
```

## Tests
```pseudocode
it('renders null when no fragments')
it('groups fragments by type with correct counts')
it('disables spend button when not active player')
it('disables spend button when fewer than 3 fragments')
it('shows selector on spend click')
it('validates: all same type passes')
it('validates: 2 typed + 1 unknown passes')
it('validates: all unknown fails')
it('validates: mixed types fails')
it('calls onUseRelicFragment with selected IDs on confirm')
```
