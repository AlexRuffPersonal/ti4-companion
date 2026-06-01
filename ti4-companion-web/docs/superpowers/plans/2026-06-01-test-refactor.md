# Test Suite Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated boilerplate across ~190 test files by introducing shared helpers, a registry-based DB mock, and one-file-per-handler consolidation of phase-tagged test splits.

**Architecture:** Four helper modules live in `tests/helpers/`. Every function test imports constants, makeRequest, and buildDbMock from these helpers. `buildDbMock` uses a table-registry pattern with a null-safe fallback so new DB queries added to handlers don't break unrelated tests. Phase-tagged files (`*.phase30.test.js`, etc.) are merged into single files using nested `describe` blocks.

**Tech Stack:** Vitest 4, @testing-library/react, React 19. All tests live in `ti4-companion-web/tests/`.

---

## File Structure

**New files:**
- `tests/helpers/constants.js` — shared UUID strings
- `tests/helpers/makeRequest.js` — generic POST factory
- `tests/helpers/mockDb.js` — chain-builder helpers + `buildDbMock` registry
- `tests/helpers/edgeFunctionMocks.js` — default stubs for `src/lib/edgeFunctions.js`

**Modified files:**
- All `tests/functions/*.test.js` — swap local boilerplate for helper imports
- All `tests/components/**/*.test.jsx` — slim vi.mock factories, add defaultProps

**Deleted files (content merged into base files):**
- Every `*.phase*.test.js` / `*.p43*.test.js` in `tests/functions/`
- `tests/components/game/TechCard.phase30.test.jsx`

---

## Task 1: Create `tests/helpers/constants.js`

**Files:**
- Create: `tests/helpers/constants.js`

- [ ] **Step 1: Create the file**

```js
// tests/helpers/constants.js
export const USER_ID    = 'user-uuid'
export const GAME_ID    = 'game-uuid'
export const PLAYER_ID  = 'player-uuid'
export const OPPONENT_ID = 'opponent-uuid'
export const COMBAT_ID  = 'combat-uuid'
export const TILE_ID    = 'tile-uuid'
export const SYSTEM_KEY = '1,-1'
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/constants.js
git commit -m "test: add shared constants helper"
```

---

## Task 2: Create `tests/helpers/makeRequest.js`

**Files:**
- Create: `tests/helpers/makeRequest.js`

- [ ] **Step 1: Create the file**

```js
// tests/helpers/makeRequest.js
export function makeRequest(functionName, body) {
  return new Request(`http://localhost/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/makeRequest.js
git commit -m "test: add shared makeRequest helper"
```

---

## Task 3: Create `tests/helpers/mockDb.js`

**Files:**
- Create: `tests/helpers/mockDb.js`

- [ ] **Step 1: Create the file**

```js
// tests/helpers/mockDb.js
import { vi } from 'vitest'

const r = (data, error = null) => vi.fn().mockResolvedValue({ data, error })

// .select().eq().maybeSingle()
export function eqSingle(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: r(data, error),
      }),
    }),
  }
}

// .select().eq().eq().maybeSingle()
export function eqEqSingle(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: r(data, error),
        }),
      }),
    }),
  }
}

// .select().eq() → resolves array
export function eqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data, error }),
    }),
  }
}

// .select().eq().eq() → resolves array
export function eqEqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

// .select().eq().eq().eq() → resolves array
export function eqEqEqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  }
}

// .select().in() → resolves array
export function inMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data, error }),
    }),
  }
}

// .select().eq().is() → resolves array
export function eqIs(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

// Fallback for any table not explicitly registered.
// Uses mockImplementation so each level is created on demand, avoiding infinite recursion.
function nullSafeChain() {
  return {
    select: vi.fn().mockImplementation(() => nullSafeChain()),
    eq: vi.fn().mockImplementation(() => nullSafeChain()),
    is: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    update: vi.fn().mockImplementation(() => nullSafeChain()),
    upsert: vi.fn().mockImplementation(() => nullSafeChain()),
    delete: vi.fn().mockImplementation(() => nullSafeChain()),
  }
}

/**
 * Wire up db.from with per-table mock shapes.
 * Tables not listed in overrides fall through to nullSafeChain(),
 * which returns null/[] for any query chain — new DB queries
 * added to handlers do not break tests that don't care about them.
 *
 * Usage:
 *   buildDbMock(db, {
 *     game_players: () => eqEqSingle({ id: PLAYER_ID }),
 *     games:        () => eqSingle({ id: GAME_ID }),
 *   })
 */
export function buildDbMock(db, overrides = {}) {
  db.from.mockImplementation((table) => overrides[table]?.() ?? nullSafeChain())
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/mockDb.js
git commit -m "test: add registry-based mockDb helper"
```

---

## Task 4: Create `tests/helpers/edgeFunctionMocks.js`

**Files:**
- Create: `tests/helpers/edgeFunctionMocks.js`

- [ ] **Step 1: Read `src/lib/edgeFunctions.js` to collect every exported function name**

Run:
```bash
grep -E "^export (async )?function" ti4-companion-web/src/lib/edgeFunctions.js | sed 's/export async function //; s/export function //; s/(.*//'
```

- [ ] **Step 2: Create the file with a stub for every export**

The file should look like this (add every function name found in Step 1):

```js
// tests/helpers/edgeFunctionMocks.js
import { vi } from 'vitest'

export const edgeFunctionStubs = {
  // One line per exported function — add every name found in src/lib/edgeFunctions.js
  activateSystem:           vi.fn().mockResolvedValue({}),
  advancePhase:             vi.fn().mockResolvedValue({}),
  assignHits:               vi.fn().mockResolvedValue({}),
  castVotes:                vi.fn().mockResolvedValue({}),
  confirmTransaction:       vi.fn().mockResolvedValue({}),
  createGame:               vi.fn().mockResolvedValue({}),
  createTransaction:        vi.fn().mockResolvedValue({}),
  declarRetreat:            vi.fn().mockResolvedValue({}),
  discardActionCard:        vi.fn().mockResolvedValue({}),
  discardSecretObjective:   vi.fn().mockResolvedValue({}),
  drawActionCard:           vi.fn().mockResolvedValue({}),
  drawAgenda:               vi.fn().mockResolvedValue({}),
  endTurn:                  vi.fn().mockResolvedValue({}),
  fireSpaceCannon:          vi.fn().mockResolvedValue({}),
  joinGame:                 vi.fn().mockResolvedValue({}),
  landTroops:               vi.fn().mockResolvedValue({}),
  moveShips:                vi.fn().mockResolvedValue({}),
  playPromissoryNote:       vi.fn().mockResolvedValue({}),
  rejectTransaction:        vi.fn().mockResolvedValue({}),
  rescindTransaction:       vi.fn().mockResolvedValue({}),
  researchTechnology:       vi.fn().mockResolvedValue({}),
  resolveAgenda:            vi.fn().mockResolvedValue({}),
  resolveCommander:         vi.fn().mockResolvedValue({}),
  rollCombatDice:           vi.fn().mockResolvedValue({}),
  scoreObjective:           vi.fn().mockResolvedValue({}),
  scoreSecretObjective:     vi.fn().mockResolvedValue({}),
  setCommandTokens:         vi.fn().mockResolvedValue({}),
  startGame:                vi.fn().mockResolvedValue({}),
  statusPhase:              vi.fn().mockResolvedValue({}),
  unlockCommander:          vi.fn().mockResolvedValue({}),
  unlockHero:               vi.fn().mockResolvedValue({}),
  updateGameSettings:       vi.fn().mockResolvedValue({}),
  // add any remaining exports not listed above
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/edgeFunctionMocks.js
git commit -m "test: add shared edge function mock stubs"
```

---

## Task 5: Pilot migration — `game-activate-system` (6 → 1 file)

This is the reference migration. All subsequent phase-consolidation tasks follow the same pattern.

**Files:**
- Modify: `tests/functions/game-activate-system.test.js`
- Delete: `tests/functions/game-activate-system.phase10.test.js`
- Delete: `tests/functions/game-activate-system.phase30.test.js`
- Delete: `tests/functions/game-activate-system.phase39b.test.js`
- Delete: `tests/functions/game-activate-system.phase43a.test.js`
- Delete: `tests/functions/game-activate-system.phase43c.test.js`

- [ ] **Step 1: Run the existing tests to confirm they all pass before touching anything**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system
```

Expected: all tests pass.

- [ ] **Step 2: Replace the top of `game-activate-system.test.js`**

Replace everything from the top of the file through the `mockDb` function definition with the following. Leave all `describe`/`it` blocks exactly as they are for now.

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- vi.mock calls (union from all 6 files) ---

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))
vi.mock('../../../supabase/functions/_shared/leaderEffects.ts', () => ({
  // phase43a tests need these specific factions; other phases ignore the value
  AGENT_REACTIVE_TRIGGERS: {
    'The Ghosts Of Creuss': ['SYSTEM_ACTIVATED'],
    'The Arborec': ['SYSTEM_ACTIVATED'],
    'The Yssaril Tribes': ['SYSTEM_ACTIVATED'],
  },
  applyCommanderPassives: vi.fn().mockResolvedValue({ pendingWindows: [] }),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyCommanderPassives } from '../../../supabase/functions/_shared/leaderEffects.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

import { USER_ID, GAME_ID, PLAYER_ID, TILE_ID, SYSTEM_KEY } from '../helpers/constants.js'
import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'
import { buildDbMock, eqEqSingle, eqSingle, eqEqEqMany, inMany, eqIs } from '../helpers/mockDb.js'

const makeRequest = (body) => _makeRequest('game-activate-system', body)

// Shared happy-path DB state for the base tests
function setupHappyPath({
  player = { id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 } },
  playerError = null,
  game = { id: GAME_ID, active_player_id: PLAYER_ID, round: 2, map_tiles: {} },
  gameError = null,
  activations = [],
  activationError = null,
  insertError = null,
  spaceUnits = [],
} = {}) {
  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: 'activation-uuid' }], error: insertError }),
  })
  buildDbMock(db, {
    game_players:            () => eqEqSingle(player, playerError),
    games:                   () => eqSingle(game, gameError),
    game_system_activations: () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: activations, error: activationError }),
          }),
        }),
      }),
      insert: insertMock,
    }),
    tiles:            () => inMany([]),
    game_player_units: () => eqIs(spaceUnits),
  })
  return { insertMock }
}

let insertMock

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  ;({ insertMock } = setupHappyPath())
})
```

- [ ] **Step 3: Run tests to confirm base tests still pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.test.js
```

Expected: all existing tests pass. If any fail, diff the old `mockDb` function against `setupHappyPath` and fix the mismatch.

- [ ] **Step 4: Append phase 10 describe block**

At the bottom of `game-activate-system.test.js`, append the full contents of `game-activate-system.phase10.test.js` wrapped in a describe block. Replace that file's local constants, makeRequest, and mockDb with the shared helpers already imported at the top.

```js
// ── phase 10 ─────────────────────────────────────────────────────────────────

describe('phase 10 — space combat trigger', () => {
  const ATTACKER_ID = 'attacker-uuid'
  const DEFENDER_ID = 'defender-uuid'
  const PHASE10_COMBAT_ID = 'combat-uuid'

  // Copy the tests from game-activate-system.phase10.test.js here.
  // Replace the local mockDb() calls with buildDbMock(db, {...}) using
  // the same table shapes as in that file's mockDb() function body.
  // Replace makeRequest({...}) with makeRequest({...}) (same — already imported).
  // Replace local USER_ID / GAME_ID with the imported constants.
})
```

- [ ] **Step 5: Append phase 30 describe block**

```js
// ── phase 30 ─────────────────────────────────────────────────────────────────

describe('phase 30 — tech effects on activation', () => {
  // Copy the tests from game-activate-system.phase30.test.js.
  // This file's leaderEffects mock is already included at the top.
  // Replace buildCommonMocks() with buildDbMock(db, {...}) using the
  // same table shapes you see in that file's buildCommonMocks() function.
})
```

- [ ] **Step 6: Append phase 39b describe block**

```js
// ── phase 39b ────────────────────────────────────────────────────────────────

describe('phase 39b — promissory note hooks on activation', () => {
  // Copy the tests from game-activate-system.phase39b.test.js.
  // promissoryEnforcement is already mocked at top level.
  // beforeEach in this block must configure getHeldNotes / getActiveNotes
  // return values if the phase39b tests override them.
})
```

- [ ] **Step 7: Append phase 43a describe block**

```js
// ── phase 43a ────────────────────────────────────────────────────────────────

describe('phase 43a — agent reactive windows', () => {
  // Copy the tests from game-activate-system.phase43a.test.js.
  // AGENT_REACTIVE_TRIGGERS is already set with the required factions at top level.
})
```

- [ ] **Step 8: Append phase 43c describe block**

```js
// ── phase 43c ────────────────────────────────────────────────────────────────

describe('phase 43c — commander passive effects', () => {
  beforeEach(() => {
    // phase43c expects inlineEffects in applyCommanderPassives result
    applyCommanderPassives.mockResolvedValue({ inlineEffects: [], pendingWindows: [] })
  })

  // Copy the tests from game-activate-system.phase43c.test.js.
})
```

- [ ] **Step 9: Run the full merged file**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.test.js
```

Expected: same number of passing tests as the six files combined. If any fail, compare the old phase file's mockDb/constants against what you wrote in the describe block and fix discrepancies.

- [ ] **Step 10: Delete the six phase files**

```bash
git rm tests/functions/game-activate-system.phase10.test.js \
       tests/functions/game-activate-system.phase30.test.js \
       tests/functions/game-activate-system.phase39b.test.js \
       tests/functions/game-activate-system.phase43a.test.js \
       tests/functions/game-activate-system.phase43c.test.js
```

- [ ] **Step 11: Commit**

```bash
git add tests/functions/game-activate-system.test.js
git commit -m "test: consolidate game-activate-system phase files, use shared helpers"
```

---

## Phase consolidation tasks (Tasks 6–24)

**How to execute each task below:**

1. Run `npx vitest run tests/functions/<handler>` to confirm all phase files pass before touching them.
2. Open every file listed and collect the **union** of all `vi.mock()` calls — include every unique module mocked across any of the files.
3. Replace the top of the base `.test.js` file with:
   - The unified `vi.mock()` section
   - Imports from `../helpers/constants.js`, `../helpers/makeRequest.js`, `../helpers/mockDb.js`
   - A `makeRequest` wrapper: `const makeRequest = (body) => _makeRequest('<function-name>', body)`
   - A `setupHappyPath()` function using `buildDbMock` (look at the default parameter values in the old `mockDb()` for the table shapes)
   - A `beforeEach` that calls `vi.clearAllMocks()`, `requireAuth.mockResolvedValue(USER_ID)`, and `setupHappyPath()`
4. Append each phase file's tests as a `describe('phase X — <description>', () => { ... })` block. Per-phase `beforeEach` blocks override any mock return values that differ from the top-level defaults.
5. Run the merged file and verify it passes.
6. `git rm` the phase files, add the base file, commit.

---

### Task 6: `game-advance-phase` (5 → 1)

**Files to merge:**
- `game-advance-phase.test.js` ← keep and extend
- `game-advance-phase.phase30.test.js` → `describe('phase 30 — ...')`
- `game-advance-phase.phase39b.test.js` → `describe('phase 39b — ...')`
- `game-advance-phase.phase40.test.js` → `describe('phase 40 — ...')`
- `game-advance-phase.phase43a.test.js` → `describe('phase 43a — ...')`

**Additional vi.mock() calls to include (beyond the standard 3):**

```js
vi.mock('../../../supabase/functions/_shared/lawEffects.ts', () => ({
  applyStatusPhaseLaws: vi.fn(async (_db, _gameId, updates) => updates),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))
// Check each phase file for additional mocks (leaderEffects, abilityHandlers, etc.)
// and add them here.
```

**Note:** The base file uses `HOST_ID` instead of `USER_ID` — keep that as a file-level constant: `const HOST_ID = 'host-uuid'`.

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase
```

---

### Task 7: `game-assign-hits` (3 → 1)

**Files to merge:**
- `game-assign-hits.test.js` ← keep
- `game-assign-hits.phase40.test.js` → `describe('phase 40 — ...')`
- `game-assign-hits.p43a.test.js` → `describe('phase 43a — Titans agent')`

**Additional vi.mock() calls:**

```js
vi.mock('../../../supabase/functions/_shared/eliminationHandler.ts', () => ({
  checkAndEliminate: vi.fn().mockResolvedValue([]),
}))
// Check phase40 and p43a files for additional mocks.
```

**Note:** The file uses `ATTACKER_ID` and `DEFENDER_ID` — keep as file-level constants.

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-assign-hits
```

---

### Task 8: `game-cast-votes` (2 → 1)

**Files to merge:**
- `game-cast-votes.test.js` ← keep
- `game-cast-votes.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes
```

---

### Task 9: `game-commit-ground-forces` (3 → 1)

**Files to merge:**
- `game-commit-ground-forces.test.js` ← keep
- `game-commit-ground-forces.phase39b.test.js` → `describe('phase 39b — ...')`
- `game-commit-ground-forces.p43c.test.js` → `describe('phase 43c — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-commit-ground-forces
```

---

### Task 10: `game-confirm-transaction` (2 → 1)

**Files to merge:**
- `game-confirm-transaction.test.js` ← keep
- `game-confirm-transaction.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-confirm-transaction
```

---

### Task 11: `game-create-transaction` (2 → 1)

**Files to merge:**
- `game-create-transaction.test.js` ← keep
- `game-create-transaction.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-create-transaction
```

---

### Task 12: `game-end-turn` (3 → 1)

**Files to merge:**
- `game-end-turn.test.js` ← keep
- `game-end-turn.phase30.test.js` → `describe('phase 30 — ...')`
- `game-end-turn.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-end-turn
```

---

### Task 13: `game-explore-planet` (2 → 1)

**Files to merge:**
- `game-explore-planet.test.js` ← keep
- `game-explore-planet.phase39.test.js` → `describe('phase 39 — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-explore-planet
```

---

### Task 14: `game-fire-anti-fighter-barrage` (2 → 1)

**Files to merge:**
- `game-fire-anti-fighter-barrage.test.js` ← keep
- `game-fire-anti-fighter-barrage.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-anti-fighter-barrage
```

---

### Task 15: `game-fire-space-cannon` (3 → 1)

**Files to merge:**
- `game-fire-space-cannon.test.js` ← keep
- `game-fire-space-cannon.phase30.test.js` → `describe('phase 30 — ...')`
- `game-fire-space-cannon.phase39b.test.js` → `describe('phase 39b — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-space-cannon
```

---

### Task 16: `game-land-troops` (3 → 1)

**Files to merge:**
- `game-land-troops.test.js` ← keep
- `game-land-troops.phase39.test.js` → `describe('phase 39 — ...')`
- `game-land-troops.phase40.test.js` → `describe('phase 40 — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-land-troops
```

---

### Task 17: `game-move-ships` (2 → 1, no base file)

**Files to merge:**
- `game-move-ships.phase40.test.js` → rename to `game-move-ships.test.js` and use as base
- `game-move-ships.p43c.test.js` → `describe('phase 43c — ...')`

**Steps:**
1. Copy `game-move-ships.phase40.test.js` to `game-move-ships.test.js`
2. Apply the standard migration pattern to the new base file
3. Append the p43c tests as a describe block
4. `git rm game-move-ships.phase40.test.js game-move-ships.p43c.test.js`
5. `git add game-move-ships.test.js`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-move-ships
```

---

### Task 18: `game-play-action-card` (2 → 1)

**Files to merge:**
- `game-play-action-card.test.js` ← keep
- `game-play-action-card.phase30.test.js` → `describe('phase 30 — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-action-card
```

---

### Task 19: `game-play-promissory-note` (rename only)

**Files:**
- `game-play-promissory-note.phase39a.test.js` → rename to `game-play-promissory-note.test.js`

There is no base file — the only file is the phase39a variant. Rename it to the standard name, then apply the standard migration pattern (replace constants, makeRequest, mockDb with helpers).

```bash
git mv tests/functions/game-play-promissory-note.phase39a.test.js \
       tests/functions/game-play-promissory-note.test.js
```

**Additional vi.mock() calls in this file:**

```js
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryHandlers.ts', () => ({
  resolvePromissoryHandler: vi.fn().mockResolvedValue(undefined),
}))
```

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

---

### Task 20: `game-roll-combat-dice` (2 → 1, no base file)

**Files to merge:**
- `game-roll-combat-dice.phase30.test.js` → rename to `game-roll-combat-dice.test.js`
- `game-roll-combat-dice.p43c.test.js` → `describe('phase 43c — ...')`

Same rename-then-extend pattern as Task 17.

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-combat-dice
```

---

### Task 21: `game-roll-ground-combat-dice` (3 → 1)

**Files to merge:**
- `game-roll-ground-combat-dice.test.js` ← keep
- `game-roll-ground-combat-dice.phase30.test.js` → `describe('phase 30 — ...')`
- `game-roll-ground-combat-dice.p43c.test.js` → `describe('phase 43c — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-ground-combat-dice
```

---

### Task 22: `game-start` (2 → 1)

**Files to merge:**
- `game-start.test.js` ← keep
- `game-start.phase7.test.js` → `describe('phase 7 — ...')`

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-start
```

---

### Task 23: `game-update-command-tokens` (rename only)

**Files:**
- `game-update-command-tokens.phase6.test.js` → rename to `game-update-command-tokens.test.js`

```bash
git mv tests/functions/game-update-command-tokens.phase6.test.js \
       tests/functions/game-update-command-tokens.test.js
```

Apply standard migration (helpers for constants/makeRequest/mockDb).

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-update-command-tokens.test.js
```

---

### Task 24: `game-score-objective` (rename only)

**Files:**
- `game-score-objective.phase36.test.js` → rename to `game-score-objective.test.js`

```bash
git mv tests/functions/game-score-objective.phase36.test.js \
       tests/functions/game-score-objective.test.js
```

Apply standard migration.

**Run command:**
```bash
cd ti4-companion-web && npx vitest run tests/functions/game-score-objective.test.js
```

---

## Standalone function test migration (Tasks 25–35)

**Pattern for each file (no consolidation — just boilerplate replacement):**

1. Run the test first: `npx vitest run tests/functions/<file>`
2. At the top of the file, replace:
   - `const USER_ID = ...`, `const GAME_ID = ...`, etc. → `import { USER_ID, GAME_ID, PLAYER_ID } from '../helpers/constants.js'`
   - The local `function makeRequest(body) { ... }` → `import { makeRequest as _makeRequest } from '../helpers/makeRequest.js'` then `const makeRequest = (body) => _makeRequest('<function-name>', body)`
   - The local `function mockDb({ ... } = {}) { db.from.mockImplementation(...) }` → `import { buildDbMock, eqSingle, eqEqSingle, eqMany, ... } from '../helpers/mockDb.js'` then replace the `mockDb()` body with a `buildDbMock(db, { ... })` call. Map each `if (table === '...')` branch to a key in the overrides object using the appropriate chain builder.
3. Run again to confirm passing.
4. Commit.

---

### Task 25: Lobby and session handlers

**Files:**
- `tests/functions/game-create.test.js`
- `tests/functions/game-join.test.js`
- `tests/functions/game-pick-faction-color.test.js`
- `tests/functions/game-set-speaker.test.js`
- `tests/functions/game-update-settings.test.js`
- `tests/functions/game-add-bot.test.js`
- `tests/functions/game-remove-bot.test.js`

Apply the standalone pattern to each. Run each file individually after editing, then batch commit:

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-create.test.js tests/functions/game-join.test.js tests/functions/game-pick-faction-color.test.js tests/functions/game-set-speaker.test.js tests/functions/game-update-settings.test.js tests/functions/game-add-bot.test.js tests/functions/game-remove-bot.test.js
git add tests/functions/game-create.test.js tests/functions/game-join.test.js tests/functions/game-pick-faction-color.test.js tests/functions/game-set-speaker.test.js tests/functions/game-update-settings.test.js tests/functions/game-add-bot.test.js tests/functions/game-remove-bot.test.js
git commit -m "test: migrate lobby handler tests to shared helpers"
```

---

### Task 26: Turn flow handlers

**Files:**
- `tests/functions/game-status-phase.test.js`
- `tests/functions/game-undo.test.js`
- `tests/functions/game-pass-action-window.test.js`
- `tests/functions/game-pass-strategy-secondary.test.js`
- `tests/functions/game-play-strategy-card.test.js`
- `tests/functions/game-use-strategy-secondary.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-status-phase tests/functions/game-undo tests/functions/game-pass-action-window tests/functions/game-pass-strategy-secondary tests/functions/game-play-strategy-card tests/functions/game-use-strategy-secondary
git add tests/functions/game-status-phase.test.js tests/functions/game-undo.test.js tests/functions/game-pass-action-window.test.js tests/functions/game-pass-strategy-secondary.test.js tests/functions/game-play-strategy-card.test.js tests/functions/game-use-strategy-secondary.test.js
git commit -m "test: migrate turn-flow handler tests to shared helpers"
```

---

### Task 27: Card draw and discard handlers

**Files:**
- `tests/functions/game-draw-action-card.test.js`
- `tests/functions/game-draw-agenda.test.js`
- `tests/functions/game-discard-secret-objective.test.js`
- `tests/functions/game-score-secret-objective.test.js`
- `tests/functions/game-resolve-agenda.test.js`
- `tests/functions/game-shuffle-exploration-deck.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-draw-action-card tests/functions/game-draw-agenda tests/functions/game-discard-secret-objective tests/functions/game-score-secret-objective tests/functions/game-resolve-agenda tests/functions/game-shuffle-exploration-deck
git add tests/functions/game-draw-action-card.test.js tests/functions/game-draw-agenda.test.js tests/functions/game-discard-secret-objective.test.js tests/functions/game-score-secret-objective.test.js tests/functions/game-resolve-agenda.test.js tests/functions/game-shuffle-exploration-deck.test.js
git commit -m "test: migrate card handler tests to shared helpers"
```

---

### Task 28: Transaction handlers

**Files:**
- `tests/functions/game-reject-transaction.test.js`
- `tests/functions/game-rescind-transaction.test.js`
- `tests/functions/game-play-combat-action-card.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-reject-transaction tests/functions/game-rescind-transaction tests/functions/game-play-combat-action-card
git add tests/functions/game-reject-transaction.test.js tests/functions/game-rescind-transaction.test.js tests/functions/game-play-combat-action-card.test.js
git commit -m "test: migrate transaction handler tests to shared helpers"
```

---

### Task 29: Technology and leader handlers

**Files:**
- `tests/functions/game-exhaust-technology.test.js`
- `tests/functions/game-use-technology-action.test.js`
- `tests/functions/game-unlock-hero.test.js`
- `tests/functions/game-unlock-commander.test.js`
- `tests/functions/game-resolve-commander-reroll.test.js`
- `tests/functions/game-deploy-mech.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-exhaust-technology tests/functions/game-use-technology-action tests/functions/game-unlock-hero tests/functions/game-unlock-commander tests/functions/game-resolve-commander-reroll tests/functions/game-deploy-mech
git add tests/functions/game-exhaust-technology.test.js tests/functions/game-use-technology-action.test.js tests/functions/game-unlock-hero.test.js tests/functions/game-unlock-commander.test.js tests/functions/game-resolve-commander-reroll.test.js tests/functions/game-deploy-mech.test.js
git commit -m "test: migrate technology/leader handler tests to shared helpers"
```

---

### Task 30: Relic and special handlers

**Files:**
- `tests/functions/game-use-relic.test.js`
- `tests/functions/game-use-relic-fragment.test.js`
- `tests/functions/game-use-enigmatic-device.test.js`
- `tests/functions/game-resolve-exploration-card.test.js`
- `tests/functions/game-explore-frontier.test.js`
- `tests/functions/game-roll-rift-dice.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-use-relic tests/functions/game-use-relic-fragment tests/functions/game-use-enigmatic-device tests/functions/game-resolve-exploration-card tests/functions/game-explore-frontier tests/functions/game-roll-rift-dice
git add tests/functions/game-use-relic.test.js tests/functions/game-use-relic-fragment.test.js tests/functions/game-use-enigmatic-device.test.js tests/functions/game-resolve-exploration-card.test.js tests/functions/game-explore-frontier.test.js tests/functions/game-roll-rift-dice.test.js
git commit -m "test: migrate relic/exploration handler tests to shared helpers"
```

---

### Task 31: Combat sub-handlers

**Files:**
- `tests/functions/game-advance-barrage.test.js`
- `tests/functions/game-advance-bombardment.test.js`
- `tests/functions/game-fire-bombardment.test.js`
- `tests/functions/game-fire-space-cannon-defense.test.js`
- `tests/functions/game-declare-retreat.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-barrage tests/functions/game-advance-bombardment tests/functions/game-fire-bombardment tests/functions/game-fire-space-cannon-defense tests/functions/game-declare-retreat
git add tests/functions/game-advance-barrage.test.js tests/functions/game-advance-bombardment.test.js tests/functions/game-fire-bombardment.test.js tests/functions/game-fire-space-cannon-defense.test.js tests/functions/game-declare-retreat.test.js
git commit -m "test: migrate combat sub-handler tests to shared helpers"
```

---

### Task 32: Draft handlers

**Files:**
- `tests/functions/game-start-draft.test.js`
- `tests/functions/game-draft-pick-slice.test.js`
- `tests/functions/game-draft-place-tile.test.js`

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-start-draft tests/functions/game-draft-pick-slice tests/functions/game-draft-place-tile
git add tests/functions/game-start-draft.test.js tests/functions/game-draft-pick-slice.test.js tests/functions/game-draft-place-tile.test.js
git commit -m "test: migrate draft handler tests to shared helpers"
```

---

## Task 33: Admin import tests (12 files)

All 12 admin import test files follow an identical pattern — each mocks `auth.ts`, `db.ts`, and imports a single handler. They use the same `USER_ID` and `GAME_ID` pattern.

**Files:**
- `tests/functions/admin-import-action-cards.test.js`
- `tests/functions/admin-import-agendas.test.js`
- `tests/functions/admin-import-attachments.test.js`
- `tests/functions/admin-import-exploration-cards.test.js`
- `tests/functions/admin-import-factions.test.js`
- `tests/functions/admin-import-leaders.test.js`
- `tests/functions/admin-import-promissory-notes.test.js`
- `tests/functions/admin-import-public-objectives.test.js`
- `tests/functions/admin-import-relics.test.js`
- `tests/functions/admin-import-secret-objectives.test.js`
- `tests/functions/admin-import-technologies.test.js`
- `tests/functions/admin-import-tiles.test.js`
- `tests/functions/admin-import-units.test.js`

Apply the standalone pattern. The makeRequest wrapper will differ per file (e.g. `_makeRequest('admin-import-action-cards', body)`). These files likely use a simpler `insert`-only mock — look at each file's `mockDb` to see the table shapes.

```bash
cd ti4-companion-web && npx vitest run tests/functions/admin-import
git add tests/functions/admin-import-*.test.js
git commit -m "test: migrate admin import tests to shared helpers"
```

---

## Component test migration (Tasks 34–38)

**Pattern for component tests:**

1. Replace the `vi.mock('../../src/lib/edgeFunctions.js', () => ({ ... }))` factory body with a spread of `edgeFunctionStubs` plus any test-specific overrides:

```js
import { edgeFunctionStubs } from '../../helpers/edgeFunctionMocks.js'
// Note: files in tests/components/*.test.jsx (one level deep) use '../helpers/...'
// Files in tests/components/game/*.test.jsx, tests/components/admin/*.test.jsx, etc.
// (two levels deep) use '../../helpers/...'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  ...edgeFunctionStubs,
  researchTechnology: vi.fn().mockResolvedValue({ ok: true }), // only if this test overrides it
}))
```

2. Add a file-level `defaultProps` object for any component rendered in 3+ `it()` blocks with the same props:

```js
const defaultProps = {
  // all required props with sensible test values
}
// in tests: render(<ComponentName {...defaultProps} />)
// in tests that need overrides: render(<ComponentName {...defaultProps} specificProp={value} />)
```

3. Run and commit per batch.

---

### Task 34: Auth + admin component tests

**Files:**
- `tests/components/auth/LoginScreen.test.jsx`
- `tests/components/admin/AdminBrowsePage.test.jsx`
- `tests/components/admin/AdminDashboard.test.jsx`
- `tests/components/admin/AdminImportPage.test.jsx`
- `tests/components/admin/AdminRecordModal.test.jsx`
- `tests/components/admin/AdminRoute.test.jsx`

```bash
cd ti4-companion-web && npx vitest run tests/components/auth tests/components/admin
git add tests/components/auth/ tests/components/admin/
git commit -m "test: slim auth/admin component tests, add defaultProps"
```

---

### Task 35: Shared + game screen component tests

**Files:**
- `tests/components/ExhaustPlanetPicker.test.jsx`
- `tests/components/GameHeader.test.jsx`
- `tests/components/game/GameScreen.test.jsx`
- `tests/components/game/LobbyScreen.test.jsx`
- `tests/components/game/SetupScreen.test.jsx`
- `tests/components/game/HostControlsSection.test.jsx`
- `tests/components/game/ScoreboardSection.test.jsx`
- `tests/components/game/MapPreviewSection.test.jsx`
- `tests/components/game/HexMap.test.jsx`
- `tests/components/game/FleetDisplay.test.jsx`

```bash
cd ti4-companion-web && npx vitest run tests/components/ExhaustPlanetPicker tests/components/GameHeader tests/components/game/GameScreen tests/components/game/LobbyScreen tests/components/game/SetupScreen tests/components/game/HostControlsSection tests/components/game/ScoreboardSection tests/components/game/MapPreviewSection tests/components/game/HexMap tests/components/game/FleetDisplay
git add tests/components/ExhaustPlanetPicker.test.jsx tests/components/GameHeader.test.jsx tests/components/game/GameScreen.test.jsx tests/components/game/LobbyScreen.test.jsx tests/components/game/SetupScreen.test.jsx tests/components/game/HostControlsSection.test.jsx tests/components/game/ScoreboardSection.test.jsx tests/components/game/MapPreviewSection.test.jsx tests/components/game/HexMap.test.jsx tests/components/game/FleetDisplay.test.jsx
git commit -m "test: slim screen/map component tests, add defaultProps"
```

---

### Task 36: Combat component tests

**Files:**
- `tests/components/game/CombatModal.test.jsx`
- `tests/components/game/SpaceCombatModal.test.jsx`
- `tests/components/game/GroundCombatModal.test.jsx`
- `tests/components/game/SpaceCannonModal.test.jsx`
- `tests/components/game/DiceResultsPanel.test.jsx`
- `tests/components/game/RetreatDestinationPicker.test.jsx`
- `tests/components/game/MoveShipsModal.test.jsx`
- `tests/components/game/PlanetSelectionModal.test.jsx`
- `tests/components/game/TokenRedistributionModal.test.jsx`
- `tests/components/game/UnitTooltip.test.jsx`

```bash
cd ti4-companion-web && npx vitest run tests/components/game/CombatModal tests/components/game/SpaceCombatModal tests/components/game/GroundCombatModal tests/components/game/SpaceCannonModal tests/components/game/DiceResultsPanel tests/components/game/RetreatDestinationPicker tests/components/game/MoveShipsModal tests/components/game/PlanetSelectionModal tests/components/game/TokenRedistributionModal tests/components/game/UnitTooltip
git add tests/components/game/CombatModal.test.jsx tests/components/game/SpaceCombatModal.test.jsx tests/components/game/GroundCombatModal.test.jsx tests/components/game/SpaceCannonModal.test.jsx tests/components/game/DiceResultsPanel.test.jsx tests/components/game/RetreatDestinationPicker.test.jsx tests/components/game/MoveShipsModal.test.jsx tests/components/game/PlanetSelectionModal.test.jsx tests/components/game/TokenRedistributionModal.test.jsx tests/components/game/UnitTooltip.test.jsx
git commit -m "test: slim combat component tests, add defaultProps"
```

---

### Task 37: Action/card component tests

**Files:**
- `tests/components/game/ActionCardModal.test.jsx`
- `tests/components/game/ActionCardWindowPanel.test.jsx`
- `tests/components/game/ActionWindowBanner.test.jsx`
- `tests/components/game/PlayPromissoryNoteModal.test.jsx`
- `tests/components/game/TradeModal.test.jsx`
- `tests/components/game/TradeOfferBanner.test.jsx`
- `tests/components/game/TransactionLogModal.test.jsx`
- `tests/components/game/InPlayNotesPanel.test.jsx`
- `tests/components/game/RelicFragmentPanel.test.jsx`
- `tests/components/game/LegendaryCardPanel.test.jsx`

```bash
cd ti4-companion-web && npx vitest run tests/components/game/ActionCardModal tests/components/game/ActionCardWindowPanel tests/components/game/ActionWindowBanner tests/components/game/PlayPromissoryNoteModal tests/components/game/TradeModal tests/components/game/TradeOfferBanner tests/components/game/TransactionLogModal tests/components/game/InPlayNotesPanel tests/components/game/RelicFragmentPanel tests/components/game/LegendaryCardPanel
git add tests/components/game/ActionCardModal.test.jsx tests/components/game/ActionCardWindowPanel.test.jsx tests/components/game/ActionWindowBanner.test.jsx tests/components/game/PlayPromissoryNoteModal.test.jsx tests/components/game/TradeModal.test.jsx tests/components/game/TradeOfferBanner.test.jsx tests/components/game/TransactionLogModal.test.jsx tests/components/game/InPlayNotesPanel.test.jsx tests/components/game/RelicFragmentPanel.test.jsx tests/components/game/LegendaryCardPanel.test.jsx
git commit -m "test: slim action/card component tests, add defaultProps"
```

---

### Task 38: Remaining component tests + TechCard consolidation

**Files:**
- `tests/components/game/TechCard.test.jsx` + `TechCard.phase30.test.jsx` → merge to single file (same pattern as function test consolidation)
- `tests/components/game/AgendaSection.test.jsx`
- `tests/components/game/AgendaResolutionModal.test.jsx`
- `tests/components/game/VotingPanel.test.jsx`
- `tests/components/game/EnactedLawsPanel.test.jsx`
- `tests/components/game/AbilityNotificationBar.test.jsx`
- `tests/components/game/AbilityTargetModal.test.jsx`
- `tests/components/game/SecretObjectivesModal.test.jsx`
- `tests/components/game/SecretObjectiveSelectionScreen.test.jsx`
- `tests/components/game/SystemInfoModal.test.jsx`
- `tests/components/game/ExplorationModal.test.jsx`
- `tests/components/game/EndTurnDialog.test.jsx`
- `tests/components/game/ProductionModal.test.jsx`
- `tests/components/game/RiftTransitModal.test.jsx`
- `tests/components/game/RulesModal.test.jsx`
- `tests/components/game/TechTreeModal.test.jsx`

For **TechCard**: copy `TechCard.phase30.test.jsx` tests into `TechCard.test.jsx` under `describe('phase 30 — ...')`, then `git rm TechCard.phase30.test.jsx`.

For all others: apply the standard component migration pattern.

```bash
cd ti4-companion-web && npx vitest run tests/components/game/TechCard tests/components/game/AgendaSection tests/components/game/AgendaResolutionModal tests/components/game/VotingPanel tests/components/game/EnactedLawsPanel tests/components/game/AbilityNotificationBar tests/components/game/AbilityTargetModal tests/components/game/SecretObjectivesModal tests/components/game/SecretObjectiveSelectionScreen tests/components/game/SystemInfoModal tests/components/game/ExplorationModal tests/components/game/EndTurnDialog tests/components/game/ProductionModal tests/components/game/RiftTransitModal tests/components/game/RulesModal tests/components/game/TechTreeModal
git rm tests/components/game/TechCard.phase30.test.jsx
git add tests/components/game/
git commit -m "test: consolidate TechCard phase test; slim remaining component tests"
```

---

## Task 39: Final validation

- [ ] **Step 1: Run the full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass. The total test count should be equal to or greater than the pre-refactor count (no tests dropped).

- [ ] **Step 2: Confirm no phase-tagged test files remain**

```bash
ls tests/functions/*.phase*.test.js tests/functions/*.p4*.test.js 2>/dev/null && echo "FAIL: phase files remain" || echo "OK: no phase files remain"
```

Expected output: `OK: no phase files remain`

- [ ] **Step 3: Confirm all test files import from helpers**

```bash
grep -rL "from '../helpers/" tests/functions/*.test.js | head -20
```

Expected: no output (every function test imports from helpers). If any files appear, apply the standalone migration pattern to them.

- [ ] **Step 4: Commit if any loose ends were fixed in this step**

```bash
git add -p
git commit -m "test: final cleanup after test suite refactor"
```
