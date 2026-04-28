# component-GameScreen-p25
**File:** `src/components/game/GameScreen.jsx`
**Status:** Modify
**Prereqs:** hook-useRiftTransit, component-RiftTransitModal

## Changes

```pseudocode
// Add import:
import { useRiftTransit } from '../../hooks/useRiftTransit.js'
import RiftTransitModal from './RiftTransitModal.jsx'

// Add hook call after existing hooks:
const { activeTransit, rollAll, rollOne, loading: riftLoading, error: riftError } =
  useRiftTransit(game?.id)

// Add modal at bottom of return (alongside other modals):
{activeTransit && (
  <RiftTransitModal
    transit={activeTransit}
    myPlayerId={currentPlayer?.id}
    players={players}
    tileMap={game?.map_tiles}   // already available from useGame
    onRollAll={rollAll}
    onRollOne={rollOne}
    onClose={() => {/* no client state to clear — modal hides when transit completes */}}
    loading={riftLoading}
    error={riftError}
  />
)}
```

## Tests

```pseudocode
it('calls useRiftTransit with game id')
it('renders RiftTransitModal when activeTransit is not null')
it('does not render RiftTransitModal when activeTransit is null')
```
