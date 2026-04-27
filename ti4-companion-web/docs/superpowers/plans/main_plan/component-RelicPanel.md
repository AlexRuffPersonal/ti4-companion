# component-RelicPanel
**File:** `src/components/game/RelicPanel.jsx`
**Status:** New
**Prereqs:** hook-useExploration

## Functionality
```pseudocode
props: { relics[], isActivePlayer, onUseRelic }

ACTION_RELICS = ['Dominus Orb','Maw Of Worlds','Stellar Converter','The Codex','Enigmatic Device']

if relics.length === 0 → return null

PANEL(sm):
  LABEL("Relics")

  for each relic:
    row:
      relic.name (bold if not exhausted/purged)
      MUTED(relic.text)

      if relic.exhaustable:
        status badge: "Exhausted" if relic.exhausted else "Ready"

      if relic.name IN ACTION_RELICS:
        btn "Use (Action)"
          disabled if !isActivePlayer OR relic.exhausted OR relic.state='purged'
          onClick → onUseRelic(relic.id, null)

      elif relic.exhaustable AND !relic.purge_on_use:
        btn "Use"
          disabled if relic.exhausted OR relic.state='purged'
          onClick → onUseRelic(relic.id, null)

      // Relics with choices (Prophet's Tears) handled via inline choice UI before calling onUseRelic
      // Crown of Emphidia exhaust + optional purge: two separate buttons
```

## Tests
```pseudocode
it('renders null when no relics')
it('renders each relic name and text')
it('shows exhausted badge for exhaustable relics')
it('disables ACTION relic button when not active player')
it('disables ACTION relic button when exhausted')
it('disables ACTION relic button when purged')
it('calls onUseRelic with relic id on click')
```
