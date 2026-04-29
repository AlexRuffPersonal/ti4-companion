# component-GameScreen-p29b
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** component-ActionWindowBanner, client-edgeFunctions-p29a

## Changes

Import `ActionWindowBanner` and the two edge function wrappers, add a `windowLoading` state, and render the banner above existing modals.

```pseudocode
import ActionWindowBanner from './ActionWindowBanner'
import { passActionWindow, playActionCard } from '../../lib/edgeFunctions'

// Add state:
const [windowLoading, setWindowLoading] = useState(false)

// Add handlers:
async function handlePassWindow() {
  setWindowLoading(true)
  await passActionWindow(gameId)
  setWindowLoading(false)
}

async function handlePlayWindowCard(cardId) {
  setWindowLoading(true)
  await playActionCard(gameId, { card_id: cardId })
  setWindowLoading(false)
}

// Render (above existing modals):
<ActionWindowBanner
  window={game?.pending_action_window ?? null}
  currentPlayerId={currentPlayer?.id}
  myCards={myCards}
  onPlayCard={handlePlayWindowCard}
  onPass={handlePassWindow}
  loading={windowLoading}
/>
```

## Tests

Extend `tests/components/game/GameScreen.test.jsx`:
```pseudocode
GIVEN game.pending_action_window is non-null and currentPlayer is eligible
  EXPECT ActionWindowBanner rendered
GIVEN game.pending_action_window is null
  EXPECT ActionWindowBanner not rendered
GIVEN user clicks Pass in banner
  EXPECT passActionWindow called with gameId
GIVEN user clicks a card in banner
  EXPECT playActionCard called with gameId and card id
```
