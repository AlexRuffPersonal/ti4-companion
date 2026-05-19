# component-RelicPanel-p42
**File:** `src/components/game/RelicPanel.jsx`
**Status:** Modify
**Prereqs:** component-RelicPanel, component-DiscardBrowserModal, client-edgeFunctions-p42

## Functionality
```pseudocode
ACTION_RELICS = ['Stellar Converter', 'The Codex']   // updated list

state: discardModalOpen, prophetsChoiceOpen, emphidiaPickerOpen, ignorePrerequsiteActive

for each relic:
  // Passive relics (no button)
  if relic.name === 'The Obsidian' → passive badge "+1 secret objective limit"
  if relic.name === 'Shard Of The Throne' → passive badge "1 VP (while held)"

  // Maw Of Worlds
  if relic.name === 'Maw Of Worlds':
    btn "Use (Agenda Phase)"
      disabled if phase !== 'agenda' OR relic.exhausted OR relic.state='purged'
      onClick → open tech picker → onUseRelic(relic.id, { technologyName })

  // Scepter Of Emelpar
  if relic.name === 'Scepter Of Emelpar':
    btn "Exhaust"
      disabled if relic.exhausted OR relic.state='purged'
      onClick → onUseRelic(relic.id, {})

  // The Prophet's Tears: inline choice
  if relic.name === "The Prophet's Tears":
    btn "Exhaust" → opens inline choice UI
    choice UI: "Ignore prerequisite" | "Draw action card"
      confirm → onUseRelic(relic.id, { choice: 0|1 })
      if choice=0 → set ignorePrerequsiteActive=true (used in tech research flow)

  // The Codex
  if relic.name === 'The Codex':
    btn "Use (Action)"
      disabled if !isActivePlayer OR relic.exhausted OR relic.state='purged'
      onClick → open DiscardBrowserModal
    DiscardBrowserModal onConfirm(cardIds) → onUseRelic(relic.id, { cardIds })

  // The Crown Of Emphidia: two buttons
  if relic.name === 'The Crown Of Emphidia':
    btn "Explore (after Action)"
      disabled if phase !== 'action' OR relic.exhausted OR relic.state='purged'
      onClick → open planet picker → onUseRelic(relic.id, { useType:'explore', planetName, deckType })
    btn "Purge for VP (Status Phase)"
      disabled if phase !== 'status' OR relic.state='purged' OR !controlsTombOfEmphidia
      onClick → onUseRelic(relic.id, { useType:'purge_for_vp' })

  // Phase B relics: disabled button with tooltip "Not yet implemented"
  Dominus Orb, Stellar Converter (Phase B only), The Crown Of Thalnos, Shard Of The Throne
```

## Tests
```pseudocode
it('renders passive badge for The Obsidian')
it('renders passive badge for Shard Of The Throne')
it('Maw Of Worlds button disabled outside agenda phase')
it('Maw Of Worlds button enabled in agenda phase')
it('Scepter exhausts on click')
it("Prophet's Tears opens choice UI on click")
it("Prophet's Tears calls onUseRelic with choice=0 for ignore prereq")
it("Prophet's Tears calls onUseRelic with choice=1 for draw card")
it('Codex opens DiscardBrowserModal on click')
it('Codex onConfirm calls onUseRelic with cardIds')
it('Crown of Emphidia explore button disabled outside action phase')
it('Crown of Emphidia purge_for_vp disabled outside status phase')
it('Crown of Emphidia purge_for_vp disabled when Tomb not controlled')
```
