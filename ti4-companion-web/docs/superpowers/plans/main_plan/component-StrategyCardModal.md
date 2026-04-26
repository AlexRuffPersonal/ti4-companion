# component-StrategyCardModal

**File:** `src/components/game/StrategyCardModal.jsx`
**Status:** New
**Prereqs:** hook-useStrategyCards

## Functionality

```pseudocode
props: { activePay, responses, myPlayerId, players, abilityDefs, isMyTurnToRespond,
         onUseSecondary, onPassSecondary, onClose }

IF !activePay: return null

cardHolder = players.find(p => p.id === activePay.played_by_player_id)
isCardHolder = myPlayerId === activePay.played_by_player_id
secondaryAbility = abilityDefs.find(a => source_type='strategy_card', source_id=activePay.card_number, role='secondary')

MODAL_WRAPPER
  PANEL(md)
    LABEL("STRATEGY CARD {activePay.card_number}")
    MUTED("{cardHolder.display_name} played the primary ability")

    IF isCardHolder:
      -- Card holder sees response status of all others
      FOR each response in responses sorted by initiative_order:
        player = players.find(r.player_id)
        render "{player.display_name}: {response.status}"   -- pending | used | passed
      button btn-ghost "CLOSE" → onClose

    ELSE IF isMyTurnToRespond:
      -- Show secondary ability + cost
      render secondaryAbility.description
      render cost text (e.g. "Cost: 1 Strategy Token")
      button btn-primary "USE SECONDARY" → onUseSecondary(secondaryAbility.id, selections)
      button btn-ghost "PASS" → onPassSecondary()

    ELSE:
      -- Waiting for another player
      nextPlayer = players.find(responses.find(r => r.status='pending' && min initiative_order).player_id)
      MUTED("Waiting for {nextPlayer.display_name}…")

  -- Auto-dismiss: parent removes activePay from state when status becomes 'complete'
```

## Tests

```pseudocode
it('renders nothing when activePay is null')
it('renders card number and card holder name')
it('card holder sees response list with status for each other player')
it('card holder sees CLOSE button')
it('next-to-respond player sees secondary ability text and USE SECONDARY + PASS buttons')
it('calls onUseSecondary when USE SECONDARY clicked')
it('calls onPassSecondary when PASS clicked')
it('non-next player sees waiting message with correct player name')
it('does not render USE SECONDARY for card holder')
```
