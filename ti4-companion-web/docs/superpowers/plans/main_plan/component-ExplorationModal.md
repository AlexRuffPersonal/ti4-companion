# component-ExplorationModal
**File:** `src/components/game/ExplorationModal.jsx`
**Status:** New
**Prereqs:** hook-useExploration

## Functionality
```pseudocode
props: { planet, systemKey, traits[], isFrontier, onExplorePlanet, onResolveCard, onExploreFrontier, onClose }

state: { step, deckType, drawnCard, choice, removeInfantry }
// step: 'pick_deck' | 'confirm_card' | 'pick_choice' | 'confirm_conditional' | 'done'

MODAL_WRAPPER:
  PANEL(md):

  // Step: pick deck (multi-trait planets only)
  if step='pick_deck' AND traits.length > 1:
    LABEL("Choose exploration deck")
    for each trait:
      btn → setDeckType(trait); call onExplorePlanet(planet.planet_name, trait) → setDrawnCard; setStep('confirm_card')

  // Step: display drawn card
  if step='confirm_card':
    LABEL(drawnCard.card_name)
    MUTED(drawnCard.card_text)

    if drawnCard.has_choice:
      setStep('pick_choice')
    elif drawnCard.is_conditional:
      setStep('confirm_conditional')
    else:
      // Non-interactive card — auto-resolve
      call onResolveCard(drawnCard.card_id, {}) → setStep('done')

  // Step: pick choice
  if step='pick_choice':
    LABEL("Choose an effect:")
    btn[option A] → setChoice(0); call onResolveCard(drawnCard.card_id, { choice:0 }) → setStep('done')
    btn[option B] → setChoice(1); call onResolveCard(drawnCard.card_id, { choice:1 }) → setStep('done')

  // Step: conditional mech/infantry
  if step='confirm_conditional':
    if hasMechOnPlanet (derived from systemUnits):
      MUTED("You have a mech on this planet — effect applies automatically")
      btn "Gain Effect" → call onResolveCard(drawnCard.card_id, {}) → setStep('done')
    else:
      LABEL("Remove 1 infantry to gain the effect?")
      btn "Remove Infantry & Gain" → call onResolveCard(drawnCard.card_id, { remove_infantry:true }) → setStep('done')
      btn "Skip Effect" → call onResolveCard(drawnCard.card_id, { remove_infantry:false }) → setStep('done')

  // Step: done
  if step='done':
    MUTED("Exploration complete")
    btn "Close" → onClose()

  // Frontier: single step
  if isFrontier:
    btn "Explore Frontier Token" → call onExploreFrontier(systemKey) → show result → onClose()
```

## Tests
```pseudocode
mock useExploration hooks
mock onExplorePlanet, onResolveCard, onExploreFrontier, onClose

it('shows deck picker for multi-trait planet')
it('calls explorePlanet with selected deck_type on pick')
it('auto-resolves non-interactive cards')
it('shows choice buttons for choice cards')
it('shows mech confirmation when mech present')
it('shows infantry removal prompt when no mech')
it('calls onClose after done')
it('shows frontier explore button for frontier tokens')
```
