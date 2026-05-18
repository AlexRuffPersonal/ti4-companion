# component-SystemActionModal-p38

**File:** `src/components/game/SystemActionModal.jsx`
**Status:** Modify
**Prereqs:** component-SystemActionModal (p31)

## Changes

Add three new props and a `confirmingFrontier` state for the DET post-production prompt.

```pseudocode
// New props:
props: { ...existing, hasFrontierToken, hasDarkEnergyTap, onExploreFrontier }

// New state:
[confirmingFrontier, setConfirmingFrontier] = useState(false)

// Add DONE button and inline confirmation after the PRODUCE UNITS button:
IF systemActivatedByMe AND isActivePlayer:
  IF !confirmingFrontier:
    <button btn-ghost "DONE" onClick={() => {
      if (hasFrontierToken && hasDarkEnergyTap) setConfirmingFrontier(true)
      else onClose()
    }} />
  ELSE:
    LABEL("EXPLORE FRONTIER TOKEN?")
    MUTED("You may explore the frontier token in this system.")
    <button btn-primary "EXPLORE" onClick={() => { onExploreFrontier(systemKey); onClose() }} />
    <button btn-ghost "SKIP" onClick={onClose} />
```

## Tests

```pseudocode
// tests/components/game/SystemActionModal.test.jsx additions

it('renders DONE button when system activated by caller and is active player')
it('does not render DONE when system not activated by caller')
it('closes immediately on DONE when DET conditions not met (hasFrontierToken false)')
it('closes immediately on DONE when DET conditions not met (hasDarkEnergyTap false)')
it('shows inline frontier confirmation on DONE when hasFrontierToken=true and hasDarkEnergyTap=true')
it('calls onExploreFrontier with systemKey and closes on EXPLORE')
it('calls onClose without calling onExploreFrontier on SKIP')
```
