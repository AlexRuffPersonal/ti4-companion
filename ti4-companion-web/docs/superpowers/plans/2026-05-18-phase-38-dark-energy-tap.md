# Phase 38 — Dark Energy Tap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two Dark Energy Tap technology effects: (1) retreat to completely empty adjacent systems, and (2) explore a frontier token after completing a tactical action.

**Architecture:** Bug-fix the existing Phase 20 maxHops error in `game-declare-retreat`, then add a DET branch for the empty-destination check. On the client, add a "DONE" button to `SystemActionModal` that triggers a blocking frontier-explore prompt when conditions are met; `GalaxyTab` fetches frontier token state, derives DET status, and handles the explore callback.

**Tech Stack:** Deno/TypeScript (Edge Function), React 19, Supabase JS v2, Vitest + @testing-library/react

---

## Task 1: game-declare-retreat — fix maxHops bug

**Files:**
- Modify: `supabase/functions/game-declare-retreat/index.ts:94`
- Modify: `ti4-companion-web/tests/functions/game-declare-retreat.test.js:248-270`

The existing Phase 20 implementation incorrectly allows DET owners to retreat 2 hops. Retreat range is always 1 hop. Two tests currently assert the wrong behaviour and must be corrected.

- [ ] **Step 1: Update the two now-incorrect tests**

In `tests/functions/game-declare-retreat.test.js`, replace the two DET hop tests (currently asserting `200` for 2-hop and `409` for 3-hop DET retreats) with corrected assertions:

```js
it('GIVEN Dark Energy Tap destination 2 hops away EXPECT 409', async () => {
  mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: TWO_HOP_DEST }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/not adjacent/i)
})

it('GIVEN Dark Energy Tap destination 3 hops away EXPECT 409', async () => {
  mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: THREE_HOP_DEST }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/not adjacent/i)
})
```

- [ ] **Step 2: Run the test file to verify these two tests now fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: the two updated tests fail (currently implementation gives 200 / 409 respectively, but correct behaviour is both 409).

- [ ] **Step 3: Fix maxHops in the implementation**

In `supabase/functions/game-declare-retreat/index.ts`, find line 94:

```typescript
  const maxHops = hasDarkEnergyTap ? 2 : 1
```

Replace with:

```typescript
  const maxHops = 1
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-declare-retreat/index.ts ti4-companion-web/tests/functions/game-declare-retreat.test.js
git commit -m "fix: revert incorrect DET 2-hop retreat extension from Phase 20"
```

---

## Task 2: game-declare-retreat — DET empty-system check

**Files:**
- Modify: `supabase/functions/game-declare-retreat/index.ts:100-118`
- Modify: `ti4-companion-web/tests/functions/game-declare-retreat.test.js`

- [ ] **Step 1: Update mockDb to handle the DET query path**

The DET path queries `game_player_units` with 2 `.eq()` calls then `.is()` (no `player_id` filter, no `.limit()`). The non-DET path uses 3 `.eq()` calls. Update `mockDb` to accept `allShipsInDest` and return the correct data for each path:

```js
function mockDb({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 2 } },
  combat = makeCombat(),
  game = { map_tiles: MAP_TILES },
  retreatingPlayerTechs = [],
  unitsInDest = [{ id: 'unit-1' }],
  planetsInDest = [],
  allShipsInDest = [],   // NEW: used by DET empty-system check
  updateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      // ... unchanged ...
    }
    if (table === 'game_combats') {
      // ... unchanged ...
    }
    if (table === 'games') {
      // ... unchanged ...
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({        // eq(game_id)
            eq: vi.fn().mockReturnValue({      // eq(system_key)
              eq: vi.fn().mockReturnValue({    // eq(player_id) — non-DET path
                is: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: unitsInDest, error: null }),
                }),
              }),
              is: vi.fn().mockResolvedValue({ data: allShipsInDest, error: null }), // DET path
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      // ... unchanged ...
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })
}
```

- [ ] **Step 2: Write the new DET tests**

Add these tests to the `describe('game-declare-retreat')` block:

```js
it('GIVEN DET destination 1 hop empty system EXPECT retreat accepted', async () => {
  mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'], allShipsInDest: [] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.retreat_destination).toBe(ONE_HOP_DEST)
})

it('GIVEN DET destination 1 hop has ships EXPECT 409 must be empty', async () => {
  mockDb({ retreatingPlayerTechs: ['Dark Energy Tap'], allShipsInDest: [{ id: 'ship-1' }] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/must be empty/i)
})

it('GIVEN no DET destination 1 hop own units present EXPECT retreat accepted (regression)', async () => {
  mockDb({ retreatingPlayerTechs: [], unitsInDest: [{ id: 'unit-1' }] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
  expect(res.status).toBe(200)
})

it('GIVEN no DET destination 1 hop no own presence EXPECT 409 (regression)', async () => {
  mockDb({ retreatingPlayerTechs: [], unitsInDest: [], planetsInDest: [] })
  const res = await handler(makeRequest({ game_id: GAME_ID, combat_id: COMBAT_ID, destination: ONE_HOP_DEST }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/no presence/i)
})
```

- [ ] **Step 3: Run tests to confirm new tests fail**

```bash
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: new DET tests fail; existing tests pass.

- [ ] **Step 4: Implement the DET branch in game-declare-retreat**

In `supabase/functions/game-declare-retreat/index.ts`, replace the block from line 100 (the presence check block) through line 118:

```typescript
  if (hasDarkEnergyTap) {
    // DET: destination must be completely empty — no ships from any player
    const { data: allShipsInDest } = await db
      .from('game_player_units').select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', body.destination)
      .is('on_planet', null)
    if ((allShipsInDest ?? []).length > 0) {
      return errorResponse('Destination must be empty for Dark Energy Tap retreat', 409)
    }
  } else {
    // Standard: player must have presence in destination
    const { data: unitsInDest } = await db
      .from('game_player_units').select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', body.destination)
      .eq('player_id', player.id)
      .is('on_planet', null)
      .limit(1)
    const { data: planetsInDest } = await db
      .from('game_player_planets').select('id')
      .eq('game_id', body.game_id)
      .eq('system_key', body.destination)
      .eq('player_id', player.id)
      .limit(1)
    if ((unitsInDest ?? []).length === 0 && (planetsInDest ?? []).length === 0) {
      return errorResponse('No presence in destination system: no units or controlled planets', 409)
    }
  }
```

- [ ] **Step 5: Run full test suite to confirm all pass**

```bash
npx vitest run tests/functions/game-declare-retreat.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-declare-retreat/index.ts ti4-companion-web/tests/functions/game-declare-retreat.test.js
git commit -m "feat: add Dark Energy Tap empty-system retreat validation"
```

---

## Task 3: SystemActionModal — DONE button + DET frontier confirmation

**Files:**
- Modify: `src/components/game/SystemActionModal.jsx`
- Modify: `ti4-companion-web/tests/components/game/SystemActionModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/game/SystemActionModal.test.jsx` (after the existing tests, inside the `describe` block). The `BASE_PROPS` already has `isActivePlayer: false` and `myActivations: new Set()`. For DONE tests, we need `isActivePlayer: true` and `myActivations: new Set(['1,-1'])`:

```jsx
describe('DONE button', () => {
  const DONE_BASE = {
    ...BASE_PROPS,
    isActivePlayer: true,
    myActivations: new Set(['1,-1']),
  }

  it('renders DONE button when system activated by caller and is active player', () => {
    render(<SystemActionModal {...DONE_BASE} />)
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument()
  })

  it('does not render DONE when system not activated by caller', () => {
    render(<SystemActionModal {...DONE_BASE} myActivations={new Set()} />)
    expect(screen.queryByRole('button', { name: /^done$/i })).not.toBeInTheDocument()
  })

  it('calls onClose immediately on DONE when hasFrontierToken is false', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...DONE_BASE} hasFrontierToken={false} hasDarkEnergyTap={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText(/explore frontier token/i)).not.toBeInTheDocument()
  })

  it('calls onClose immediately on DONE when hasDarkEnergyTap is false', () => {
    const onClose = vi.fn()
    render(<SystemActionModal {...DONE_BASE} hasFrontierToken={true} hasDarkEnergyTap={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText(/explore frontier token/i)).not.toBeInTheDocument()
  })

  it('shows inline frontier confirmation on DONE when both hasFrontierToken and hasDarkEnergyTap are true', () => {
    render(<SystemActionModal {...DONE_BASE} hasFrontierToken={true} hasDarkEnergyTap={true} onExploreFrontier={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(screen.getByText(/explore frontier token/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument()
  })

  it('calls onExploreFrontier with systemKey and calls onClose on EXPLORE', () => {
    const onExploreFrontier = vi.fn()
    const onClose = vi.fn()
    render(
      <SystemActionModal
        {...DONE_BASE}
        hasFrontierToken={true}
        hasDarkEnergyTap={true}
        onExploreFrontier={onExploreFrontier}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^explore$/i }))
    expect(onExploreFrontier).toHaveBeenCalledWith('1,-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose without calling onExploreFrontier on SKIP', () => {
    const onExploreFrontier = vi.fn()
    const onClose = vi.fn()
    render(
      <SystemActionModal
        {...DONE_BASE}
        hasFrontierToken={true}
        hasDarkEnergyTap={true}
        onExploreFrontier={onExploreFrontier}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }))
    expect(onExploreFrontier).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/game/SystemActionModal.test.jsx
```

Expected: new DONE button tests fail; existing tests pass.

- [ ] **Step 3: Implement the changes in SystemActionModal**

At the top of `src/components/game/SystemActionModal.jsx`, add `useState` to the import:

```jsx
import { useState } from 'react'
```

Update the props destructuring line (line 1):

```jsx
export default function SystemActionModal({
  systemKey, tileInfo, activations, planetOwnership, players,
  currentPlayer, isActivePlayer, hasAvailableTacticTokens,
  myActivations, onActivate, onLandTroops, onClose, custodiansClaimed,
  myPlanets, systemUnits, unitDefs, onOpenProduction, onInfo,
  hasFrontierToken, hasDarkEnergyTap, onExploreFrontier,
}) {
```

Add state after the existing derivations (after the `hasSpaceDock` line):

```jsx
  const [confirmingFrontier, setConfirmingFrontier] = useState(false)
```

Add the DONE button and frontier confirmation block after the PRODUCE UNITS button (before the `custodiansClaimed` block):

```jsx
        {systemActivatedByMe && isActivePlayer && !confirmingFrontier && (
          <button
            className="btn-ghost w-full mb-2"
            onClick={() => {
              if (hasFrontierToken && hasDarkEnergyTap) setConfirmingFrontier(true)
              else onClose()
            }}
          >
            DONE
          </button>
        )}

        {confirmingFrontier && (
          <div className="mb-2">
            <p className="label text-xs mb-1">EXPLORE FRONTIER TOKEN?</p>
            <p className="text-muted text-xs mb-2">You may explore the frontier token in this system.</p>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => { onExploreFrontier(systemKey); onClose() }}
              >
                EXPLORE
              </button>
              <button className="btn-ghost flex-1" onClick={onClose}>
                SKIP
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx vitest run tests/components/game/SystemActionModal.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SystemActionModal.jsx ti4-companion-web/tests/components/game/SystemActionModal.test.jsx
git commit -m "feat: add DONE button and DET frontier exploration prompt to SystemActionModal"
```

---

## Task 4: GalaxyTab — DET state, wiring, and explore callback

**Files:**
- Modify: `src/components/game/GalaxyTab.jsx`
- Modify: `ti4-companion-web/tests/components/game/GalaxyTab.test.jsx`

- [ ] **Step 1: Write failing tests**

The existing GalaxyTab test mocks `SystemActionModal` to expose only `systemKey`, `onClose`, `onInfo`. Update the mock to also capture the new DET props so we can assert on them. Add tests at the end of `tests/components/game/GalaxyTab.test.jsx`:

First, update the `SystemActionModal` mock near the top of the file to capture DET props:

```jsx
vi.mock('../../../src/components/game/SystemActionModal.jsx', () => ({
  default: ({ systemKey, onClose, onInfo, hasFrontierToken, hasDarkEnergyTap, onExploreFrontier, myPlanets }) => (
    <div data-testid="system-modal">
      <span>{systemKey}</span>
      <span data-testid="has-frontier-token">{String(hasFrontierToken)}</span>
      <span data-testid="has-det">{String(hasDarkEnergyTap)}</span>
      <button onClick={onClose}>Close Modal</button>
      {onInfo && <button onClick={onInfo}>Info</button>}
      {onExploreFrontier && (
        <button onClick={() => onExploreFrontier(systemKey)}>Explore Frontier</button>
      )}
      <span data-testid="my-planets-count">{(myPlanets ?? []).length}</span>
    </div>
  ),
}))
```

Also mock `supabase` since GalaxyTab will now query it:

```js
vi.mock('../../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    }),
  },
}))
```

Add a supabase import at the top of the test file:

```js
import { supabase } from '../../../src/lib/supabase.js'
```

Add the new tests:

```jsx
it('passes hasFrontierToken=false by default (no system state)', async () => {
  render(<GalaxyTab {...BASE_PROPS} />)
  fireEvent.click(screen.getByText('Select Hex'))
  await waitFor(() => expect(screen.getByTestId('has-frontier-token')).toHaveTextContent('false'))
})

it('passes hasFrontierToken=true when active system has_frontier_token', async () => {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { has_frontier_token: true } }),
        }),
      }),
    }),
  })
  const activations = [{ id: 'act-1', system_key: '1,-1', player_id: 'p1', round: 1 }]
  render(<GalaxyTab {...BASE_PROPS} activations={activations} myActivations={new Set(['1,-1'])} />)
  fireEvent.click(screen.getByText('Select Hex'))
  await waitFor(() => expect(screen.getByTestId('has-frontier-token')).toHaveTextContent('true'))
})

it('passes hasDarkEnergyTap=true when currentPlayer has Dark Energy Tap technology', async () => {
  render(<GalaxyTab {...BASE_PROPS} currentPlayer={{ ...CURRENT_PLAYER, technologies: ['Dark Energy Tap'] }} />)
  fireEvent.click(screen.getByText('Select Hex'))
  await waitFor(() => expect(screen.getByTestId('has-det')).toHaveTextContent('true'))
})

it('passes myPlanets filtered to current player', async () => {
  const allPlanets = [
    { id: 'pl-1', player_id: 'p1', planet_name: 'Wellon' },
    { id: 'pl-2', player_id: 'p2', planet_name: 'Mecatol Rex' },
  ]
  render(<GalaxyTab {...BASE_PROPS} allPlanets={allPlanets} />)
  fireEvent.click(screen.getByText('Select Hex'))
  await waitFor(() => expect(screen.getByTestId('my-planets-count')).toHaveTextContent('1'))
})

it('calls exploration.exploreFrontier and shows ExplorationModal on handleExploreFrontier', async () => {
  const exploreFrontier = vi.fn().mockResolvedValue({ card_name: 'Stellar Converter' })
  const exploration = { exploreFrontier, canExplore: vi.fn().mockReturnValue(false) }
  render(<GalaxyTab {...BASE_PROPS} exploration={exploration} />)
  fireEvent.click(screen.getByText('Select Hex'))
  await waitFor(() => expect(screen.getByTestId('system-modal')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Explore Frontier'))
  await waitFor(() => expect(exploreFrontier).toHaveBeenCalledWith('1,-1'))
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: new DET tests fail; existing tests pass.

- [ ] **Step 3: Add supabase import and new props to GalaxyTab**

At the top of `src/components/game/GalaxyTab.jsx`, add after the existing imports:

```jsx
import { supabase } from '../../lib/supabase.js'
```

Update the `GalaxyTab` function signature to destructure `onOpenProduction`:

```jsx
export default function GalaxyTab({
  gameId, mapTiles, tileData, activations, allPlanets, systemUnits,
  activatedSystems, myActivations, planetOwnership, activeCombat, myPlayerId,
  players, currentPlayer, game, unitDefs, myTokenSystems, planetStaticMap,
  activateSystem, landTroops, exploration, onOpenProduction,
}) {
```

- [ ] **Step 4: Add DET state derivations inside GalaxyTab**

After the existing state declarations (after `const [selectedPlanet, setSelectedPlanet] = useState(null)`), add:

```jsx
  const [activeSystemHasFrontierToken, setActiveSystemHasFrontierToken] = useState(false)
  const myPlanets = (allPlanets ?? []).filter(p => p.player_id === currentPlayer?.id)
  const hasDarkEnergyTap = (currentPlayer?.technologies ?? []).includes('Dark Energy Tap')
```

After the `useCombat` call and existing `useEffect` blocks, add a new `useEffect` for frontier token state:

```jsx
  useEffect(() => {
    if (!activeSystemKey || !gameId) {
      setActiveSystemHasFrontierToken(false)
      return
    }
    supabase
      .from('game_system_state')
      .select('has_frontier_token')
      .eq('game_id', gameId)
      .eq('system_key', activeSystemKey)
      .maybeSingle()
      .then(({ data }) => setActiveSystemHasFrontierToken(data?.has_frontier_token ?? false))
  }, [activeSystemKey, gameId])
```

- [ ] **Step 5: Add handleExploreFrontier and update SystemActionModal render**

After `handleLandTroops`, add:

```jsx
  async function handleExploreFrontier(systemKey) {
    try {
      const result = await exploration.exploreFrontier(systemKey)
      if (result?.card_name) {
        setSelectedPlanet({ planet_name: null, isFrontier: true, card_name: result.card_name })
        setShowExplorationModal(true)
      }
    } catch (e) {
      console.error('Frontier explore error:', e)
    }
  }
```

Update the `<SystemActionModal>` render (around line 167) to add the new props:

```jsx
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
          onInfo={() => setInfoSystemKey(selectedSystemKey)}
          myPlanets={myPlanets}
          systemUnits={systemUnits}
          unitDefs={unitDefs}
          onOpenProduction={onOpenProduction}
          hasFrontierToken={activeSystemHasFrontierToken}
          hasDarkEnergyTap={hasDarkEnergyTap}
          onExploreFrontier={handleExploreFrontier}
        />
      )}
```

- [ ] **Step 6: Run tests to confirm all pass**

```bash
npx vitest run tests/components/game/GalaxyTab.test.jsx
```

Expected: all tests pass.

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Note the count — it should be higher than the pre-task count.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/GalaxyTab.jsx ti4-companion-web/tests/components/game/GalaxyTab.test.jsx
git commit -m "feat: wire Dark Energy Tap frontier exploration in GalaxyTab"
```

---

## Task 5: Update main_plan spec statuses

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Mark Phase 38 specs as done**

In `_index.md`, change the three Phase 38 rows from `planned` to `done`:

```
| fn-game-declare-retreat-p38 | ... | 38 | Dark Energy Tap | done | ... |
| component-SystemActionModal-p38 | ... | 38 | Dark Energy Tap | done | ... |
| component-GalaxyTab-p38 | ... | 38 | Dark Energy Tap | done | ... |
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 38 Dark Energy Tap specs as done"
```

---

## Summary

| Task | Files | Tests |
|------|-------|-------|
| 1 | `game-declare-retreat/index.ts` | `game-declare-retreat.test.js` — fix 2 incorrect tests |
| 2 | `game-declare-retreat/index.ts` | `game-declare-retreat.test.js` — 4 new tests |
| 3 | `SystemActionModal.jsx` | `SystemActionModal.test.jsx` — 7 new tests |
| 4 | `GalaxyTab.jsx` | `GalaxyTab.test.jsx` — 4 new tests |
| 5 | `_index.md` | — |
