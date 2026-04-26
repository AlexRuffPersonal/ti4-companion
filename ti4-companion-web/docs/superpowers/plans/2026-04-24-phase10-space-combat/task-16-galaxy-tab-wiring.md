# Task 16: Modify GalaxyTab — Wire Combat Modals

**Files:**
- Modify: `src/components/game/GalaxyTab.jsx`
- Modify: `tests/components/game/GalaxyTab.test.jsx`

**Context:** `GalaxyTab` already receives `activeCombat` and `gameId` from `galaxyState` (via spread props from `GameScreen`). It now calls `useCombat(gameId, activeCombat?.id)` internally to get the dispatchers and the live `combat` state. It renders `SpaceCannonModal` when `combat?.phase === 'space_cannon'`, and `CombatModal` for all other active phases. `SystemActionModal` is hidden while combat is active.

New props received (added to the spread from `galaxyState`):
- `gameId` — already returned by `useGalaxy`
- `activeCombat` — already returned by `useGalaxy` (after Task 10)
- `myPlayerId` — already returned by `useGalaxy` (after Task 10)

---

- [ ] **Step 1: Write new failing tests in `tests/components/game/GalaxyTab.test.jsx`**

Add the following `describe` block to the existing test file (do not remove existing tests):

```jsx
// Add these imports at the top of the existing file:
// import SpaceCannonModal from '../../../src/components/game/SpaceCannonModal.jsx'
// import CombatModal from '../../../src/components/game/CombatModal.jsx'

vi.mock('../../../src/components/game/SpaceCannonModal.jsx', () => ({
  default: ({ combat, onFire, onPass }) => (
    <div data-testid="space-cannon-modal">
      <button onClick={onFire}>Fire SC</button>
      <button onClick={onPass}>Pass SC</button>
    </div>
  ),
}))

vi.mock('../../../src/components/game/CombatModal.jsx', () => ({
  default: ({ combat, onRollDice }) => (
    <div data-testid="combat-modal">
      <span>{combat?.phase}</span>
      <button onClick={onRollDice}>Roll</button>
    </div>
  ),
}))

vi.mock('../../../src/hooks/useCombat.js', () => ({
  useCombat: vi.fn(() => ({
    combat: null,
    fireSpaceCannon: vi.fn(),
    rollDice: vi.fn(),
    assignHits: vi.fn(),
    declareRetreat: vi.fn(),
  })),
}))

// Then add this describe block:
describe('GalaxyTab — combat modals (Phase 10)', () => {
  beforeEach(() => {
    const { useCombat } = require('../../../src/hooks/useCombat.js')
    useCombat.mockReturnValue({
      combat: null,
      fireSpaceCannon: vi.fn(),
      rollDice: vi.fn(),
      assignHits: vi.fn(),
      declareRetreat: vi.fn(),
    })
  })

  it('does not render SpaceCannonModal or CombatModal when no active combat', () => {
    render(<GalaxyTab {...BASE_PROPS} activeCombat={null} gameId="g1" myPlayerId="p1" />)
    expect(screen.queryByTestId('space-cannon-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('combat-modal')).not.toBeInTheDocument()
  })

  it('renders SpaceCannonModal when combat phase is space_cannon', () => {
    const { useCombat } = require('../../../src/hooks/useCombat.js')
    useCombat.mockReturnValue({
      combat: { id: 'c1', phase: 'space_cannon', space_cannon_pending: [] },
      fireSpaceCannon: vi.fn(),
      rollDice: vi.fn(),
      assignHits: vi.fn(),
      declareRetreat: vi.fn(),
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1', phase: 'space_cannon' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByTestId('space-cannon-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('combat-modal')).not.toBeInTheDocument()
  })

  it('renders CombatModal when combat phase is attacker_roll', () => {
    const { useCombat } = require('../../../src/hooks/useCombat.js')
    useCombat.mockReturnValue({
      combat: { id: 'c1', phase: 'attacker_roll', round: 1, status: 'active', attacker_hits: 0, defender_hits: 0, attacker_dice: null, defender_dice: null, retreat_declared_by: null, winner_player_id: null, system_key: '1,-1', attacker_player_id: 'p1', defender_player_id: 'p2' },
      fireSpaceCannon: vi.fn(),
      rollDice: vi.fn(),
      assignHits: vi.fn(),
      declareRetreat: vi.fn(),
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1', phase: 'attacker_roll' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByTestId('combat-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('space-cannon-modal')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the GalaxyTab test file to verify the new tests fail**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: existing tests pass, 3 new tests fail — mocked modules not wired to GalaxyTab yet.

- [ ] **Step 3: Replace `src/components/game/GalaxyTab.jsx` with the wired version**

```jsx
import { useState } from 'react'
import HexMap from './HexMap.jsx'
import SystemActionModal from './SystemActionModal.jsx'
import SpaceCannonModal from './SpaceCannonModal.jsx'
import CombatModal from './CombatModal.jsx'
import { useCombat } from '../../hooks/useCombat.js'

export default function GalaxyTab({
  gameId, mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership, activeCombat, myPlayerId,
  players, currentPlayer, game,
  activateSystem, landTroops,
}) {
  const [selectedSystemKey, setSelectedSystemKey] = useState(null)
  const [custodiansClaimed, setCustodiansClaimed] = useState(false)

  const { combat, fireSpaceCannon, rollDice, assignHits, declareRetreat } =
    useCombat(gameId, activeCombat?.id)

  const isActivePlayer = game?.active_player_id === currentPlayer?.id
  const tacticUsed = activations.filter(a => a.player_id === currentPlayer?.id).length
  const tacticTotal = currentPlayer?.command_tokens?.tactic_total ?? 0
  const hasAvailableTacticTokens = tacticTotal > tacticUsed

  async function handleActivate(systemKey) {
    try {
      await activateSystem(systemKey)
    } catch (e) {
      console.error('Activate error:', e)
    }
    setSelectedSystemKey(null)
  }

  async function handleLandTroops(systemKey, planetName, troopCount) {
    try {
      const result = await landTroops(systemKey, planetName, troopCount)
      if (result?.custodians_claimed) setCustodiansClaimed(true)
    } catch (e) {
      console.error('Land troops error:', e)
    }
    setSelectedSystemKey(null)
  }

  const selectedTileInfo = selectedSystemKey
    ? tileData[mapTiles[selectedSystemKey]?.tile_id] ?? null
    : null

  const combatActive = combat && combat.status === 'active'
  const showSpaceCannon = combatActive && combat.phase === 'space_cannon'
  const showCombat = combatActive && combat.phase !== 'space_cannon'

  return (
    <div className="panel flex flex-col" style={{ height: '70vh' }}>
      <p className="label mb-2">GALAXY</p>
      <div className="flex-1 min-h-0">
        <HexMap
          mapTiles={mapTiles}
          tileData={tileData}
          activations={activations}
          systemUnits={systemUnits}
          planetOwnership={planetOwnership}
          players={players}
          onSelectSystem={setSelectedSystemKey}
        />
      </div>

      {selectedSystemKey && !combatActive && (
        <SystemActionModal
          systemKey={selectedSystemKey}
          tileInfo={selectedTileInfo}
          activations={activations.filter(a => a.system_key === selectedSystemKey)}
          planetOwnership={planetOwnership}
          players={players}
          currentPlayer={currentPlayer}
          isActivePlayer={isActivePlayer}
          hasAvailableTacticTokens={hasAvailableTacticTokens}
          myActivations={myActivations}
          onActivate={handleActivate}
          onLandTroops={handleLandTroops}
          onClose={() => setSelectedSystemKey(null)}
          custodiansClaimed={custodiansClaimed}
        />
      )}

      {showSpaceCannon && (
        <SpaceCannonModal
          combat={combat}
          myPlayerId={myPlayerId}
          onFire={() => fireSpaceCannon(false)}
          onPass={() => fireSpaceCannon(true)}
        />
      )}

      {showCombat && (
        <CombatModal
          combat={combat}
          myPlayerId={myPlayerId}
          players={players}
          systemUnits={systemUnits}
          mapTiles={mapTiles}
          tileData={tileData}
          allPlanets={allPlanets}
          onRollDice={rollDice}
          onAssignHits={assignHits}
          onDeclareRetreat={declareRetreat}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all GalaxyTab tests to verify they pass**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: all existing tests pass + 3 new tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Note the new count.

- [ ] **Step 6: Deploy all new and modified edge functions**

```bash
supabase functions deploy game-activate-system --no-verify-jwt
supabase functions deploy game-fire-space-cannon --no-verify-jwt
supabase functions deploy game-roll-combat-dice --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
supabase functions deploy game-declare-retreat --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
```

- [ ] **Step 7: Commit**

```bash
git add src/components/game/GalaxyTab.jsx tests/components/game/GalaxyTab.test.jsx
git commit -m "feat: wire SpaceCannonModal and CombatModal into GalaxyTab via useCombat"
```
