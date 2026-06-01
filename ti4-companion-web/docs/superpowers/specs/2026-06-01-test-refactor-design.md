# Test Suite Refactor Design

**Date:** 2026-06-01  
**Scope:** All tests — `tests/functions/` and `tests/components/`  
**Approach:** Shared helpers + thin `vi.mock()` shims (Approach A)

---

## Problem statement

The test suite has three compounding pain points:

1. **Maintenance cost** — adding a new shared module or DB table query requires patching boilerplate across dozens of test files
2. **Fragility** — the nested `db.from.mockImplementation` switch in each file breaks when a handler gains a new query; every affected test file must be updated manually
3. **Readability** — phase-tagged split files (`game-activate-system.phase30.test.js`, `.phase39b.test.js`, etc.) each repeat the full mock preamble, making it hard to see what's actually being tested

---

## Solution overview

Introduce a `tests/helpers/` directory of small shared modules. Each test file keeps its `vi.mock()` calls (Vitest hoisting requires this), but they become thin shims that delegate to the helpers. Phase-tagged files are consolidated one-file-per-handler.

---

## Helper modules

### `tests/helpers/constants.js`

Shared UUID constants used across most tests.

```js
export const USER_ID    = 'user-uuid'
export const GAME_ID    = 'game-uuid'
export const PLAYER_ID  = 'player-uuid'
export const OPPONENT_ID = 'opponent-uuid'
export const COMBAT_ID  = 'combat-uuid'
```

Add further constants (e.g. `TILE_ID`, `SYSTEM_KEY`) as needed when consolidating files — keep only those that recur across multiple test files.

---

### `tests/helpers/makeRequest.js`

Generic POST factory. The only variation across files is the function name in the URL.

```js
export function makeRequest(functionName, body) {
  return new Request(`http://localhost/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}
```

---

### `tests/helpers/mockDb.js`

The registry-based DB mock. This is the primary fix for maintenance cost and fragility.

**Chain-builder helpers** cover the four common query shapes:

```js
// .select().eq().maybeSingle()
export function eqSingle(data, error = null) { ... }

// .select().eq().eq().maybeSingle()
export function eqEqSingle(data, error = null) { ... }

// .select().eq() → resolves array
export function eqMany(data, error = null) { ... }

// .select().in() → resolves array  (used by tile lookups)
export function inMany(data, error = null) { ... }
```

Each wraps `vi.fn().mockReturnValue(...)` chains, with the terminal call using `vi.fn().mockResolvedValue(...)`.

**`nullSafeTable()`** — fallback for any table not registered. Returns a mock chain that resolves to `{ data: null, error: null }` at every terminal point (`.maybeSingle()`, array resolves, etc.). The handler's own code determines whether it treats the result as single or array — `null` is safe for both. This means adding a new DB query to a handler does not break tests that don't care about it.

**Default table registry** — pre-built responses for the ~8 most-queried tables:

```js
const DEFAULTS = {
  game_players:            () => eqEqSingle({ id: PLAYER_ID, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, technologies: [], leaders: null }),
  games:                   () => eqSingle({ id: GAME_ID, phase: 30, round: 1, active_player_id: PLAYER_ID }),
  game_system_activations: () => eqMany([]),
  game_player_units:       () => eqMany([]),
  tiles:                   () => /* .select().in() */ inMany([]),
  // add further defaults as consolidation reveals patterns
}
```

**`buildDbMock(db, overrides = {})`** — merges defaults with per-test overrides and installs on `db.from`:

```js
export function buildDbMock(db, overrides = {}) {
  const tables = { ...DEFAULTS, ...overrides }
  db.from.mockImplementation((table) => tables[table]?.() ?? nullSafeTable())
}
```

Each test's `beforeEach` becomes:

```js
beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  buildDbMock(db)
})
```

A test asserting a 404 (player not found) overrides just the relevant table:

```js
buildDbMock(db, { game_players: () => eqEqSingle(null) })
```

---

### `tests/helpers/edgeFunctionMocks.js`

Default stubs for all functions exported from `src/lib/edgeFunctions.js`. Component test files spread this object in their `vi.mock` factory and override only what they care about.

```js
export const edgeFunctionStubs = {
  researchTechnology:    vi.fn().mockResolvedValue({}),
  drawActionCard:        vi.fn().mockResolvedValue({}),
  discardActionCard:     vi.fn().mockResolvedValue({}),
  // ... all exports
}
```

---

## `vi.mock()` shim pattern (function tests)

Vitest hoists `vi.mock()` to the top of the file — the calls cannot be eliminated, but each one becomes a thin shim. The three present in nearly every function test:

```js
vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(m) { super(m); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ACTIVATE_SYSTEM: 'activate_system',  // event name constant changes per file
}))
```

Additional module mocks (e.g. `leaderEffects.ts`, `promissoryEnforcement.ts`) are included only in files whose handler actually imports them. When consolidating phase files, include the union of all `vi.mock()` calls from all phases at the top of the combined file — unused mocks in a given `describe` block are harmless.

---

## Phase file consolidation

One file per handler. Phase-tagged files (`*.phase30.test.js`, `*.phase39b.test.js`, etc.) are merged into the base file using nested `describe` blocks.

**Before:**
- `game-activate-system.test.js`
- `game-activate-system.phase30.test.js`
- `game-activate-system.phase39b.test.js`
- `game-activate-system.phase43c.test.js`

**After:**
```js
// union of all vi.mock() calls from all four files

describe('game-activate-system', () => {
  // tests from .test.js

  describe('phase 30 — tech effects', () => {
    // tests from .phase30.test.js
  })

  describe('phase 39b — ...', () => {
    // tests from .phase39b.test.js
  })

  describe('phase 43c — ...', () => {
    // tests from .phase43c.test.js
  })
})
```

The phase-tagged source files are deleted once their content is merged.

---

## Component test pattern

No new shared modules needed beyond `edgeFunctionMocks.js`. Each component test file applies a **file-level prop fixture** — a `defaultProps` object at the top with sensible defaults for every required prop. Individual `it()` blocks spread and override:

```js
const defaultProps = {
  player: { id: 'p1', technologies: [], faction: 'Arborec' },
  allTechnologies: ALL_TECHS,
  gameId: GAME_ID,
  onClose: vi.fn(),
  // ...
}

render(<TechTreeModal {...defaultProps} />)
render(<TechTreeModal {...defaultProps} onClose={specificMock} />)
```

This is a file-level convention, not a global helper.

---

## Migration scope and validation

**Order of work:**
1. Write and test helper modules (`constants.js`, `makeRequest.js`, `mockAuth.js`, `mockDb.js`, `edgeFunctionMocks.js`)
2. Migrate function tests handler-by-handler, consolidating phase files as you go
3. Migrate component tests file-by-file
4. Delete merged phase-variant files

**Validation gate:**

The full test suite (`npm test` from `ti4-companion-web/`) must pass before and after. The assertion count must not drop — every test that existed before must still exist after consolidation. No new tests are expected; the goal is structural improvement only.

---

## Files introduced

| File | Purpose |
|------|---------|
| `tests/helpers/constants.js` | Shared UUID constants |
| `tests/helpers/makeRequest.js` | Generic POST factory |
| `tests/helpers/mockDb.js` | Registry-based DB mock builder |
| `tests/helpers/edgeFunctionMocks.js` | Default edge function stubs for component tests |

No changes to `vitest.config.js` or `tests/setup.js` are required.
