# Task 02: Phase 10 Edge Function Wrappers

**Files:**
- Modify: `src/lib/edgeFunctions.js`
- Create: `tests/lib/edgeFunctions.phase10.test.js`

---

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/edgeFunctions.phase10.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  fireSpaceCannon,
  rollCombatDice,
  assignHits,
  declareRetreat,
} from '../../src/lib/edgeFunctions.js'

describe('Phase 10 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fireSpaceCannon calls game-fire-space-cannon with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { phase: 'barrage' }, error: null })
    await fireSpaceCannon('g1', 'c1', false)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-fire-space-cannon', {
      body: { game_id: 'g1', combat_id: 'c1', pass: false },
    })
  })

  it('fireSpaceCannon with pass=true sends pass: true', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { phase: 'attacker_roll' }, error: null })
    await fireSpaceCannon('g1', 'c1', true)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-fire-space-cannon', {
      body: { game_id: 'g1', combat_id: 'c1', pass: true },
    })
  })

  it('rollCombatDice calls game-roll-combat-dice with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { phase: 'defender_assign' }, error: null })
    await rollCombatDice('g1', 'c1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-roll-combat-dice', {
      body: { game_id: 'g1', combat_id: 'c1' },
    })
  })

  it('assignHits calls game-assign-hits with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { status: 'active' }, error: null })
    const casualties = [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }]
    await assignHits('g1', 'c1', casualties)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-assign-hits', {
      body: { game_id: 'g1', combat_id: 'c1', casualties },
    })
  })

  it('declareRetreat calls game-declare-retreat with correct params', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { retreat_destination: '2,-1' }, error: null })
    await declareRetreat('g1', 'c1', '2,-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-declare-retreat', {
      body: { game_id: 'g1', combat_id: 'c1', destination: '2,-1' },
    })
  })

  it('fireSpaceCannon throws on error', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Combat not found' },
    })
    await expect(fireSpaceCannon('g1', 'c1', false)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web
npx vitest run tests/lib/edgeFunctions.phase10.test.js
```

Expected: FAIL — `fireSpaceCannon is not a function` (or similar import error).

- [ ] **Step 3: Add the four exports to `src/lib/edgeFunctions.js`**

Append before the final `export { callFunction }` line:

```js
export const fireSpaceCannon = (gameId, combatId, pass) =>
  callFunction('game-fire-space-cannon', { game_id: gameId, combat_id: combatId, pass })

export const rollCombatDice = (gameId, combatId) =>
  callFunction('game-roll-combat-dice', { game_id: gameId, combat_id: combatId })

export const assignHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-hits', { game_id: gameId, combat_id: combatId, casualties })

export const declareRetreat = (gameId, combatId, destination) =>
  callFunction('game-declare-retreat', { game_id: gameId, combat_id: combatId, destination })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase10.test.js
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.phase10.test.js
git commit -m "feat: add Phase 10 edge function wrappers (fireSpaceCannon, rollCombatDice, assignHits, declareRetreat)"
```
