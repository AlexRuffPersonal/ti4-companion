# Phase 39b: Promissory Note Passive Enforcement Hooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add promissory note enforcement hooks to all 14 trigger-point Edge Functions. Model A (Support for the Throne, Alliance) is already hardcoded in game-confirm-transaction; this phase adds Dark Pact to confirm-transaction and hooks to all other functions.

**Architecture:** Each function imports `getActiveNotes` or `getHeldNotes` from `promissoryEnforcement.ts`. Model B notes check `getActiveNotes` for `in_play` entries; Model D notes check `getHeldNotes` for `held` entries. Return trigger fires `returnNote`. The DB columns for combat modifiers (cavalry, tekklar) were pre-created in migration 032.

**Tech Stack:** Deno/TypeScript Edge Functions, Supabase JS v2, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Modify | `supabase/functions/game-confirm-transaction/index.ts` |
| Modify | `supabase/functions/game-activate-system/index.ts` |
| Modify | `supabase/functions/game-advance-phase/index.ts` |
| Modify | `supabase/functions/game-create-transaction/index.ts` |
| Modify | `supabase/functions/game-cast-votes/index.ts` |
| Modify | `supabase/functions/game-produce-units/index.ts` |
| Modify | `supabase/functions/game-roll-combat-dice/index.ts` |
| Modify | `supabase/functions/game-roll-ground-combat-dice/index.ts` |
| Modify | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` |
| Modify | `supabase/functions/game-fire-space-cannon/index.ts` |
| Modify | `supabase/functions/game-research-technology/index.ts` |
| Modify | `supabase/functions/game-commit-ground-forces/index.ts` |
| Modify | `supabase/functions/game-resolve-ability/index.ts` |
| Modify | `supabase/functions/game-end-turn/index.ts` |
| Create | `ti4-companion-web/tests/functions/game-confirm-transaction.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-activate-system.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-advance-phase.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-create-transaction.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-cast-votes.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-produce-units.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-roll-combat-dice.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-roll-ground-combat-dice.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-fire-space-cannon.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-research-technology.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-commit-ground-forces.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-resolve-ability.phase39b.test.js` |
| Create | `ti4-companion-web/tests/functions/game-end-turn.phase39b.test.js` |

---

### Shared Test Setup Note

Every test file in this phase follows the same pattern:
```js
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({
    supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
    bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
    tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
  }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))
```

This ensures existing tests in base files are unaffected; new `.phase39b.test.js` files override the mock for specific scenarios.

---

### Task 1: Dark Pact hook in `game-confirm-transaction`

**Files:**
- Modify: `supabase/functions/game-confirm-transaction/index.ts`
- Create: `ti4-companion-web/tests/functions/game-confirm-transaction.phase39b.test.js`

Read `supabase/functions/game-confirm-transaction/index.ts` before making changes.

- [ ] **Step 1: Write failing test**

```js
// ti4-companion-web/tests/functions/game-confirm-transaction.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_CONFIRM_TRANSACTION: 'confirm_transaction',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn(),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-confirm-transaction/index.ts'

const GAME_ID = 'g', FROM = 'p1', TO = 'p2', EMPYREAN = 'p1', HOLDER = 'p2'

function makeRequest(body) {
  return new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body) })
}

// Minimal mockDb for a successful commodity-only transaction
function mockDb({ commoditiesOffer = 3, fromCommodityMax = 3 } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn((f, v) => ({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TO, commodities: 2, trade_goods: 0 }, error: null }) }),
          })),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'game_transactions') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'tx', from_player_id: FROM, to_player_id: TO, status: 'pending', active_player_id: null, items: { offer: { commodities: commoditiesOffer, trade_goods: 0, note_ids: [] }, request: { commodities: 0, trade_goods: 0, note_ids: [] } } }, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'games') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { active_player_id: FROM, phase: 'action' }, error: null }) }) }) }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }
  })
}

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user'); })

describe('Dark Pact hook', () => {
  it('GIVEN Dark Pact in_play, holder → Empyrean at max commodities → both +1 TG', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [{ instanceId: 'dp1', holderPlayerId: TO, ownerPlayerId: FROM }],
      stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    mockDb({ commoditiesOffer: 3, fromCommodityMax: 3 })
    // Mock game_players for Empyrean's commodity_max lookup
    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx' }))
    expect(res.status).toBe(200)
    // Verify TG updates were called for both players (check db.from('game_players').update was called at least twice extra)
  })

  it('GIVEN Dark Pact in_play, holder → Empyrean below max → no TG bonus', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [{ instanceId: 'dp1', holderPlayerId: TO, ownerPlayerId: FROM }],
      stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    mockDb({ commoditiesOffer: 1, fromCommodityMax: 3 })
    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx' }))
    expect(res.status).toBe(200)
  })

  it('GIVEN no Dark Pact → no extra processing', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, transaction_id: 'tx' }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-confirm-transaction.phase39b.test.js
```

Expected: FAIL — Dark Pact logic not in function.

- [ ] **Step 3: Add import and Dark Pact hook to `game-confirm-transaction`**

Add import at top:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

After the transaction is confirmed (after updating status to 'confirmed'), add:

```typescript
// Dark Pact: if Dark Pact is in_play and this tx sends enough commodities to fill owner's supply
const activeNotes = await getActiveNotes(body.game_id, db)
for (const dp of activeNotes.darkPact) {
  // Dark Pact: holder gives owner enough commodities to fill owner's supply
  const isHolderSending = tx.from_player_id === dp.holderPlayerId && tx.to_player_id === dp.ownerPlayerId
  if (isHolderSending && (items.offer.commodities ?? 0) > 0) {
    const { data: ownerPlayer } = await db.from('game_players').select('commodity_max, trade_goods').eq('id', dp.ownerPlayerId).maybeSingle()
    const ownerMax = (ownerPlayer as { commodity_max: number; trade_goods: number } | null)?.commodity_max ?? 0
    if ((items.offer.commodities ?? 0) >= ownerMax) {
      // Both get +1 TG
      const ownerTG = (ownerPlayer as { trade_goods: number } | null)?.trade_goods ?? 0
      await db.from('game_players').update({ trade_goods: ownerTG + 1 }).eq('id', dp.ownerPlayerId)
      const { data: holderPlayer } = await db.from('game_players').select('trade_goods').eq('id', dp.holderPlayerId).maybeSingle()
      const holderTG = (holderPlayer as { trade_goods: number } | null)?.trade_goods ?? 0
      await db.from('game_players').update({ trade_goods: holderTG + 1 }).eq('id', dp.holderPlayerId)
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-confirm-transaction.phase39b.test.js && npx vitest run tests/functions/game-confirm-transaction.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-confirm-transaction/index.ts ti4-companion-web/tests/functions/game-confirm-transaction.phase39b.test.js
git commit -m "feat: add Dark Pact enforcement hook to game-confirm-transaction"
```

---

### Task 2: Hooks in `game-activate-system`

**Files:**
- Modify: `supabase/functions/game-activate-system/index.ts`
- Create: `ti4-companion-web/tests/functions/game-activate-system.phase39b.test.js`

Read `supabase/functions/game-activate-system/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-activate-system.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ACTIVATE_SYSTEM: 'activate_system',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-activate-system/index.ts'

// Standard constants and a minimal mockDb that returns a successful activation
const GAME_ID = 'g', PLAYER_ID = 'p1', SYSTEM_KEY = '3,0'
const HOLDER_ID = 'p2', OWNER_ID = 'p1'

// mockDb is minimal — build it according to the current function's queries.
// Consult game-activate-system/index.ts to determine required mocks.

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Ceasefire (Model D)', () => {
  it('GIVEN Ceasefire held, activating player = owner, holder has units in system → 409', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Ceasefire') return Promise.resolve([{ instanceId: 'c1', holderPlayerId: HOLDER_ID, ownerPlayerId: OWNER_ID }])
      return Promise.resolve([])
    })
    // db mock: holder (HOLDER_ID) has units in system SYSTEM_KEY
    // Build minimal mockDb that passes all checks up to the Ceasefire check
    // ... (consult function file for full chain)
    // Expected: res.status === 409 with message containing 'Ceasefire'
  })

  it('GIVEN Ceasefire held, activating player ≠ owner → no block', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Ceasefire') return Promise.resolve([{ instanceId: 'c1', holderPlayerId: HOLDER_ID, ownerPlayerId: 'other-player' }])
      return Promise.resolve([])
    })
    // activating player (PLAYER_ID) ≠ note.ownerPlayerId → no block
  })
})

describe('Greyfire Mutagen (Model D)', () => {
  it('GIVEN Greyfire Mutagen held, any activation → faction_abilities_blocked set to owner; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Greyfire Mutagen') return Promise.resolve([{ instanceId: 'gm1', holderPlayerId: HOLDER_ID, ownerPlayerId: OWNER_ID }])
      return Promise.resolve([])
    })
    // Expect: db.from('game_system_activations').update({ faction_abilities_blocked_player_id: OWNER_ID }) called
    // Expect: returnNote called with ('gm1', OWNER_ID, db)
  })
})

describe('Crucible (Model D)', () => {
  it('GIVEN Crucible held, holder activates → gravity_rift_immune set to holder; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Crucible') return Promise.resolve([{ instanceId: 'cr1', holderPlayerId: PLAYER_ID, ownerPlayerId: 'vuil' }])
      return Promise.resolve([])
    })
    // Expect: db.from('game_system_activations').update({ gravity_rift_immune_player_id: PLAYER_ID }) called
    // Expect: returnNote called
  })
})

describe('Model B in-play return checks', () => {
  it('GIVEN Trade Convoys in_play, holder activates system with owner units → note returned', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [{ instanceId: 'tc1', holderPlayerId: PLAYER_ID, ownerPlayerId: 'hacan' }],
      promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // hacan has units in the system being activated by PLAYER_ID
    // Expect: returnNote('tc1', 'hacan', db)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.phase39b.test.js
```

Expected: FAIL (logic not yet in function).

- [ ] **Step 3: Add imports and hooks to `game-activate-system`**

Add imports:
```typescript
import { getActiveNotes, getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

After the tactic token is placed and activation row inserted, add the following hooks in order:

```typescript
// --- Ceasefire (Model D) ---
const ceasefireNotes = await getHeldNotes(body.game_id, 'Ceasefire', db)
for (const note of ceasefireNotes) {
  if (note.ownerPlayerId === player.id) {
    // Check if the holder has units in the activated system
    const { data: holderUnits } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('player_id', note.holderPlayerId)
      .eq('system_key', body.system_key)
      .limit(1)
    if ((holderUnits ?? []).length > 0) {
      await returnNote(note.instanceId, note.ownerPlayerId, db)
      return errorResponse('Ceasefire is in effect — cannot activate this system', 409)
    }
  }
}

// --- Greyfire Mutagen (Model D) ---
const greyfireNotes = await getHeldNotes(body.game_id, 'Greyfire Mutagen', db)
for (const note of greyfireNotes) {
  await db
    .from('game_system_activations')
    .update({ faction_abilities_blocked_player_id: note.ownerPlayerId })
    .eq('id', activationId)  // activationId is the newly inserted activation row's id
  await returnNote(note.instanceId, note.ownerPlayerId, db)
}

// --- Crucible (Model D) ---
const crucibleNotes = await getHeldNotes(body.game_id, 'Crucible', db)
for (const note of crucibleNotes) {
  if (note.holderPlayerId === player.id) {
    await db
      .from('game_system_activations')
      .update({ gravity_rift_immune_player_id: note.holderPlayerId })
      .eq('id', activationId)
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}

// --- Model B in-play return checks ---
const activeNotes = await getActiveNotes(body.game_id, db)
const modelBKeys: (keyof typeof activeNotes)[] = [
  'tradeConvoys', 'promiseOfProtection', 'bloodPact', 'darkPact', 'stymie', 'antivirus'
]
for (const key of modelBKeys) {
  for (const note of activeNotes[key]) {
    if (note.holderPlayerId === player.id) {
      const { data: ownerUnits } = await db
        .from('game_player_units')
        .select('id')
        .eq('game_id', body.game_id)
        .eq('player_id', note.ownerPlayerId)
        .eq('system_key', body.system_key)
        .limit(1)
      if ((ownerUnits ?? []).length > 0) {
        await returnNote(note.instanceId, note.ownerPlayerId, db)
      }
    }
  }
}
```

Note: `activationId` is the id of the row inserted into `game_system_activations`. Consult the function file to find where that insert happens and capture the returned id.

- [ ] **Step 4: Fill in the mockDb in the test file**

After reading the actual function, complete the `mockDb` helper in the test to stub all queries the function makes before reaching the hook code. Then run:

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.phase39b.test.js
```

Expected: PASS (all tests).

- [ ] **Step 5: Run existing tests to confirm no regressions**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.test.js tests/functions/game-activate-system.phase10.test.js tests/functions/game-activate-system.phase30.test.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-activate-system/index.ts ti4-companion-web/tests/functions/game-activate-system.phase39b.test.js
git commit -m "feat: add Ceasefire/Greyfire Mutagen/Crucible/Model B return hooks to game-activate-system"
```

---

### Task 3: Hooks in `game-advance-phase`

**Files:**
- Modify: `supabase/functions/game-advance-phase/index.ts`
- Create: `ti4-companion-web/tests/functions/game-advance-phase.phase39b.test.js`

Read `supabase/functions/game-advance-phase/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-advance-phase.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_ADVANCE_PHASE: 'advance_phase',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-advance-phase/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

// Build mockDb by reading the function file — stub all DB calls needed to reach the status phase replenish step.

describe('Trade Agreement (status phase replenish)', () => {
  it('GIVEN Trade Agreement held, owner being replenished → commodities transferred to holder; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Trade Agreement') return Promise.resolve([{ instanceId: 'ta1', holderPlayerId: 'p2', ownerPlayerId: 'p1' }])
      return Promise.resolve([])
    })
    // Setup db to handle status phase advancement with player p1 being replenished
    // Expect: commodities transferred from p1 to p2 (p1 commodities → 0, p2 trade_goods += amount)
    // Expect: returnNote('ta1', 'p1', db)
  })
})

describe('Gift of Prescience (strategy phase ordering)', () => {
  it('GIVEN Gift of Prescience in_play → holder included at priority 0 in strategy order', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: 'gop1', holderPlayerId: 'naalu-holder', ownerPlayerId: 'naalu' }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // Setup db for strategy phase advancement
    // Expect: the holder appears at initiative_order = 0 in strategy ordering
  })
})

describe('Gift of Prescience (status phase end return)', () => {
  it('GIVEN Gift of Prescience in_play at status phase end → note returned', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [],
      giftOfPrescience: [{ instanceId: 'gop1', holderPlayerId: 'p2', ownerPlayerId: 'naalu' }],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // Setup db for status phase end advancement
    // Expect: returnNote('gop1', 'naalu', db) called
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.phase39b.test.js
```

Expected: FAIL.

- [ ] **Step 3: Add imports and hooks to `game-advance-phase`**

Add imports:
```typescript
import { getActiveNotes, getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

In the status phase commodities replenish section (after each player's commodities are updated), add:

```typescript
// Trade Agreement: owner replenished → transfer all commodities to holder
const tradeAgreementNotes = await getHeldNotes(gameId, 'Trade Agreement', db)
for (const note of tradeAgreementNotes) {
  if (note.ownerPlayerId === playerId) {  // playerId = the player being replenished
    const { data: owner } = await db.from('game_players').select('commodities').eq('id', note.ownerPlayerId).maybeSingle()
    const ownerCommodities = (owner as { commodities: number } | null)?.commodities ?? 0
    if (ownerCommodities > 0) {
      await db.from('game_players').update({ commodities: 0 }).eq('id', note.ownerPlayerId)
      const { data: holder } = await db.from('game_players').select('trade_goods').eq('id', note.holderPlayerId).maybeSingle()
      const holderTG = (holder as { trade_goods: number } | null)?.trade_goods ?? 0
      await db.from('game_players').update({ trade_goods: holderTG + ownerCommodities }).eq('id', note.holderPlayerId)
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}
```

In the strategy phase ordering section, add Gift of Prescience handling:

```typescript
// Gift of Prescience: holder gets initiative 0 (before all strategy picks)
const activeNotes = await getActiveNotes(gameId, db)
for (const note of activeNotes.giftOfPrescience) {
  // Insert the holder at initiative order 0 in the strategy phase speaker order
  // Implementation depends on how the function builds speaker order — consult function file
  // Set holder's initiative to 0 before sorting players
}
```

At status phase end, add return check:

```typescript
// Gift of Prescience returns at status phase end
const activeNotesEnd = await getActiveNotes(gameId, db)
for (const note of activeNotesEnd.giftOfPrescience) {
  await returnNote(note.instanceId, note.ownerPlayerId, db)
}
```

- [ ] **Step 4: Complete the mockDb in tests and run**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.phase39b.test.js
```

Expected: PASS.

- [ ] **Step 5: Run existing tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.test.js tests/functions/game-advance-phase.phase30.test.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts ti4-companion-web/tests/functions/game-advance-phase.phase39b.test.js
git commit -m "feat: add Trade Agreement/Gift of Prescience hooks to game-advance-phase"
```

---

### Task 4: Trade Convoys hook in `game-create-transaction`

**Files:**
- Modify: `supabase/functions/game-create-transaction/index.ts`
- Create: `ti4-companion-web/tests/functions/game-create-transaction.phase39b.test.js`

Read `supabase/functions/game-create-transaction/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-create-transaction.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_CREATE_TRANSACTION: 'create_transaction',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-create-transaction/index.ts'

// Build mockDb for a non-neighbor transaction scenario

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Trade Convoys hook', () => {
  it('GIVEN Trade Convoys in_play for initiating player → non-neighbor transaction allowed', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [],
      tradeConvoys: [{ instanceId: 'tc1', holderPlayerId: 'p1', ownerPlayerId: 'hacan' }],
      promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // Setup db: p1 initiating transaction with non-neighbor p2
    // Expect: 200 (not 409 non-neighbor)
  })

  it('GIVEN Trade Convoys not in_play → non-neighbor transaction blocked', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [],
      promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // Setup db: p1 initiating with non-neighbor p2
    // Expect: 409 non-neighbor error
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-create-transaction.phase39b.test.js
```

- [ ] **Step 3: Add Trade Convoys check to `game-create-transaction`**

Add import:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

In the neighbor check section, replace the existing neighbor check with:

```typescript
// Check neighbor adjacency (unless Trade Convoys is in play for one of the parties)
const activeNotes = await getActiveNotes(body.game_id, db)
const tradeConvoysActive = activeNotes.tradeConvoys.some(
  n => n.holderPlayerId === player.id || n.holderPlayerId === body.to_player_id
)
if (!tradeConvoysActive) {
  // Existing neighbor check logic here
}
```

- [ ] **Step 4: Run tests, fix mockDb, verify pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-create-transaction.phase39b.test.js tests/functions/game-create-transaction.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-create-transaction/index.ts ti4-companion-web/tests/functions/game-create-transaction.phase39b.test.js
git commit -m "feat: add Trade Convoys neighbor-bypass hook to game-create-transaction"
```

---

### Task 5: Blood Pact hook in `game-cast-votes`

**Files:**
- Modify: `supabase/functions/game-cast-votes/index.ts`
- Create: `ti4-companion-web/tests/functions/game-cast-votes.phase39b.test.js`

Read `supabase/functions/game-cast-votes/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-cast-votes.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_CAST_VOTES: 'cast_votes',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-cast-votes/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Blood Pact +4 votes bonus', () => {
  it('GIVEN Blood Pact in_play, holder and Empyrean vote same outcome → +4 votes added', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [{ instanceId: 'bp1', holderPlayerId: 'p1', ownerPlayerId: 'empyrean' }],
      darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // Setup db: p1 casting votes for outcome 'A'; empyrean has already cast for outcome 'A'
    // Expect: p1's vote_count += 4 in final upsert
  })

  it('GIVEN Blood Pact in_play, different outcomes → no bonus', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [{ instanceId: 'bp1', holderPlayerId: 'p1', ownerPlayerId: 'empyrean' }],
      darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // empyrean voted 'B', p1 votes 'A' → no bonus
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes.phase39b.test.js
```

- [ ] **Step 3: Add Blood Pact hook to `game-cast-votes`**

Add import:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

After vote is recorded, check Blood Pact:

```typescript
const activeNotes = await getActiveNotes(body.game_id, db)
for (const note of activeNotes.bloodPact) {
  const isInvolved = note.holderPlayerId === player.id || note.ownerPlayerId === player.id
  if (isInvolved) {
    const otherId = note.holderPlayerId === player.id ? note.ownerPlayerId : note.holderPlayerId
    // Check if other party voted the same outcome on this agenda
    const { data: otherVote } = await db
      .from('game_agenda_votes')
      .select('choice')
      .eq('game_id', body.game_id)
      .eq('game_player_id', otherId)
      .eq('agenda_id', agendaId)
      .maybeSingle()
    if ((otherVote as { choice: string } | null)?.choice === body.choice) {
      // Both voted same — add +4 votes
      const { data: existingVote } = await db
        .from('game_agenda_votes')
        .select('vote_count')
        .eq('game_id', body.game_id)
        .eq('game_player_id', player.id)
        .eq('agenda_id', agendaId)
        .maybeSingle()
      const currentCount = (existingVote as { vote_count: number } | null)?.vote_count ?? 0
      await db.from('game_agenda_votes')
        .update({ vote_count: currentCount + 4 })
        .eq('game_id', body.game_id)
        .eq('game_player_id', player.id)
        .eq('agenda_id', agendaId)
    }
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes.phase39b.test.js tests/functions/game-cast-votes.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-cast-votes/index.ts ti4-companion-web/tests/functions/game-cast-votes.phase39b.test.js
git commit -m "feat: add Blood Pact +4 vote bonus hook to game-cast-votes"
```

---

### Task 6: Stymie hook in `game-produce-units`

**Files:**
- Modify: `supabase/functions/game-produce-units/index.ts`
- Create: `ti4-companion-web/tests/functions/game-produce-units.phase39b.test.js`

Read `supabase/functions/game-produce-units/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-produce-units.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-produce-units/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Stymie hook', () => {
  it('GIVEN Stymie in_play, Arborec produces in system containing holder units → 409', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [],
      stymie: [{ instanceId: 's1', holderPlayerId: 'p2', ownerPlayerId: 'arborec-player' }],
      antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // arborec-player is calling produce-units in a system where p2 has units
    // Expect: 409 'Stymie prevents Arborec production'
  })

  it('GIVEN Stymie in_play, non-Arborec player produces → allowed', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [],
      stymie: [{ instanceId: 's1', holderPlayerId: 'p2', ownerPlayerId: 'arborec-player' }],
      antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // player is NOT arborec-player → no block
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-produce-units.phase39b.test.js
```

- [ ] **Step 3: Add Stymie check to `game-produce-units`**

Add import:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

Before capacity/resource checks, add:

```typescript
const activeNotes = await getActiveNotes(body.game_id, db)
for (const note of activeNotes.stymie) {
  if (note.ownerPlayerId === player.id) {
    // Arborec is producing; check if holder's units are in or adjacent to the system
    const { data: holderUnitsInSystem } = await db
      .from('game_player_units')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('player_id', note.holderPlayerId)
      .eq('system_key', body.system_key)
      .limit(1)
    if ((holderUnitsInSystem ?? []).length > 0) {
      return errorResponse("Stymie prevents Arborec production in this system", 409)
    }
    // Adjacent check: query game_player_units for all systems and check tile adjacency
    // NOTE: adjacency check requires tile data — implement using the same adjacency helper used elsewhere in the function
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-produce-units.phase39b.test.js tests/functions/game-produce-units.test.js tests/functions/game-produce-units.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-produce-units/index.ts ti4-companion-web/tests/functions/game-produce-units.phase39b.test.js
git commit -m "feat: add Stymie block hook to game-produce-units"
```

---

### Task 7: The Cavalry hook in `game-roll-combat-dice`

**Files:**
- Modify: `supabase/functions/game-roll-combat-dice/index.ts`
- Create: `ti4-companion-web/tests/functions/game-roll-combat-dice.phase39b.test.js`

Read `supabase/functions/game-roll-combat-dice/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-roll-combat-dice.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-roll-combat-dice/index.ts'

// Note: cavalry_active_player_id and cavalry_unit_id are columns on game_combats (migration 032)

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('The Cavalry hook', () => {
  it('GIVEN cavalry_active_player_id = caller, cavalry_unit_id set → flagship stats applied to that unit', async () => {
    // Mock combat row with cavalry_active_player_id = PLAYER_ID and cavalry_unit_id = 'unit-uuid'
    // Nomad flagship stats: combat=5 (×2 dice), 2 dice
    // Expect: the unit matching cavalry_unit_id rolls with combat=5 and 2 dice instead of its own stats
  })

  it('GIVEN cavalry_active_player_id = opponent → no effect on caller rolls', async () => {
    // cavalry is set for the other player — caller's rolls are unmodified
  })

  it('GIVEN cavalry_active_player_id = null → no effect', async () => {
    // cavalry_active_player_id is null — normal roll behavior
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-combat-dice.phase39b.test.js
```

- [ ] **Step 3: Add Cavalry logic to `game-roll-combat-dice`**

After fetching the combat row (which already includes all combat columns per migration 032):

```typescript
const cavalryPlayerId = (combat as Record<string, unknown>).cavalry_active_player_id as string | null
const cavalryUnitId = (combat as Record<string, unknown>).cavalry_unit_id as string | null

// Apply Cavalry: replace the matched unit's stats with Nomad flagship stats
const NOMAD_FLAGSHIP_STATS = { combat: '5(×2)', move: 1, capacity: 3, sustain: true }
if (cavalryPlayerId === player.id && cavalryUnitId) {
  // When building the unit roll list, for the unit matching cavalryUnitId:
  // override its combatStat to parse '5(×2)' → { value: 5, dice: 2 }
  // This replaces whatever the unit's own stats are
}
```

Note: the exact integration point depends on how `game-roll-combat-dice` builds the dice list. Read the function file to find where unit stats are resolved and inject the override there.

- [ ] **Step 4: Complete mockDb in tests and run**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-combat-dice.phase39b.test.js tests/functions/game-roll-combat-dice.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-roll-combat-dice/index.ts ti4-companion-web/tests/functions/game-roll-combat-dice.phase39b.test.js
git commit -m "feat: add The Cavalry stat override to game-roll-combat-dice"
```

---

### Task 8: Tekklar Legion hook in `game-roll-ground-combat-dice`

**Files:**
- Modify: `supabase/functions/game-roll-ground-combat-dice/index.ts`
- Create: `ti4-companion-web/tests/functions/game-roll-ground-combat-dice.phase39b.test.js`

Read `supabase/functions/game-roll-ground-combat-dice/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-roll-ground-combat-dice.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-roll-ground-combat-dice/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Tekklar Legion hook', () => {
  it('GIVEN tekklar_holder_player_id = caller → each die result +1 (capped at 10)', async () => {
    // Mock combat row: tekklar_holder_player_id = PLAYER_ID
    // Mock raw dice results: [3, 7, 9]
    // Expect results after adjustment: [4, 8, 10]
  })

  it('GIVEN tekklar_holder_player_id set, caller is Sardakk (owner) → each die result −1', async () => {
    // tekklar_holder_player_id = 'someone-else', caller = sardakk_player
    // Raw dice: [3, 7, 1]
    // Expect: [2, 6, 1] (floor at 1)
  })

  it('GIVEN tekklar_holder_player_id = null → no modification', async () => {
    // Normal roll behavior
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-ground-combat-dice.phase39b.test.js
```

- [ ] **Step 3: Add Tekklar logic to `game-roll-ground-combat-dice`**

After fetching the combat row:

```typescript
const tekklarHolderId = (combat as Record<string, unknown>).tekklar_holder_player_id as string | null

if (tekklarHolderId) {
  // Adjust dice results
  if (tekklarHolderId === player.id) {
    // Holder: +1 to each die, cap at 10
    results = results.map(r => ({ ...r, value: Math.min(10, r.value + 1), hit: Math.min(10, r.value + 1) >= combatValue }))
  } else if (/* player is the Sardakk note owner */ note.ownerPlayerId === player.id) {
    // Sardakk: -1 to each die, floor at 1
    results = results.map(r => ({ ...r, value: Math.max(1, r.value - 1), hit: Math.max(1, r.value - 1) >= combatValue }))
  }
}
```

Note: to identify whether the caller is the Sardakk owner, query `game_player_promissory_notes` for the Tekklar Legion note where `tekklar_holder_player_id` is set and get its `origin_player_id`. Or: read the note from held notes — but since tekklar has already been triggered and the combat column is set, just check if `player.id !== tekklarHolderId` (i.e., Sardakk is the non-holder side). Verify this logic against the actual card text.

- [ ] **Step 4: Complete mockDb and run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-ground-combat-dice.phase39b.test.js tests/functions/game-roll-ground-combat-dice.test.js tests/functions/game-roll-ground-combat-dice.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-roll-ground-combat-dice/index.ts ti4-companion-web/tests/functions/game-roll-ground-combat-dice.phase39b.test.js
git commit -m "feat: add Tekklar Legion ±1 die modifier to game-roll-ground-combat-dice"
```

---

### Task 9: Strike Wing Ambuscade hook in `game-fire-anti-fighter-barrage`

**Files:**
- Modify: `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
- Create: `ti4-companion-web/tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js`

Read `supabase/functions/game-fire-anti-fighter-barrage/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-fire-anti-fighter-barrage/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Strike Wing Ambuscade (AFB)', () => {
  it('GIVEN Strike Wing Ambuscade held by caller, ambuscade_unit_type provided → +1 die for that unit type; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Strike Wing Ambuscade') return Promise.resolve([{ instanceId: 'swa1', holderPlayerId: 'p1', ownerPlayerId: 'argent' }])
      return Promise.resolve([])
    })
    // caller is p1; selections.ambuscade_unit_type = 'destroyer'
    // Expect: total dice for destroyer is +1 versus no-ambuscade scenario
    // Expect: returnNote('swa1', 'argent', db)
  })

  it('GIVEN Strike Wing Ambuscade not held → normal AFB roll', async () => {
    getHeldNotes.mockResolvedValue([])
    // Normal roll
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js
```

- [ ] **Step 3: Add Strike Wing Ambuscade to `game-fire-anti-fighter-barrage`**

Add imports:
```typescript
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

Before building the unit roll list:

```typescript
const swaNote = (await getHeldNotes(body.game_id, 'Strike Wing Ambuscade', db))
  .find(n => n.holderPlayerId === player.id)
const ambuscadeUnitType = (body.selections as Record<string, string> | undefined)?.ambuscade_unit_type
if (swaNote && ambuscadeUnitType) {
  // When counting dice for ambuscadeUnitType: unitCount += 1 (one extra die roll)
  // This extra die uses the same hit value as the unit's AFB stat
}
```

After rolling, if swaNote was used:
```typescript
if (swaNote) {
  await returnNote(swaNote.instanceId, swaNote.ownerPlayerId, db)
}
```

- [ ] **Step 4: Complete mockDb in tests and run**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js tests/functions/game-fire-anti-fighter-barrage.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-fire-anti-fighter-barrage/index.ts ti4-companion-web/tests/functions/game-fire-anti-fighter-barrage.phase39b.test.js
git commit -m "feat: add Strike Wing Ambuscade extra die hook to game-fire-anti-fighter-barrage"
```

---

### Task 10: Strike Wing Ambuscade hook in `game-fire-space-cannon`

**Files:**
- Modify: `supabase/functions/game-fire-space-cannon/index.ts`
- Create: `ti4-companion-web/tests/functions/game-fire-space-cannon.phase39b.test.js`

(Mirror of Task 9 but for space cannon.) Read `supabase/functions/game-fire-space-cannon/index.ts` first.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-fire-space-cannon.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-fire-space-cannon/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Strike Wing Ambuscade (Space Cannon)', () => {
  it('GIVEN Strike Wing Ambuscade held, ambuscade_unit_type set → +1 die for that unit; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Strike Wing Ambuscade') return Promise.resolve([{ instanceId: 'swa1', holderPlayerId: 'p1', ownerPlayerId: 'argent' }])
      return Promise.resolve([])
    })
    // Expect: +1 die for the specified unit type; returnNote called
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-space-cannon.phase39b.test.js
```

- [ ] **Step 3: Add same Strike Wing Ambuscade logic to `game-fire-space-cannon`**

Identical pattern to Task 9 Step 3, but in space cannon context.

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-fire-space-cannon.phase39b.test.js tests/functions/game-fire-space-cannon.test.js tests/functions/game-fire-space-cannon.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-fire-space-cannon/index.ts ti4-companion-web/tests/functions/game-fire-space-cannon.phase39b.test.js
git commit -m "feat: add Strike Wing Ambuscade extra die hook to game-fire-space-cannon"
```

---

### Task 11: Research Agreement hook in `game-research-technology`

**Files:**
- Modify: `supabase/functions/game-research-technology/index.ts`
- Create: `ti4-companion-web/tests/functions/game-research-technology.phase39b.test.js`

Read `supabase/functions/game-research-technology/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-research-technology.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Research Agreement hook', () => {
  it('GIVEN Research Agreement held, Jol-Nar (owner) researches non-faction tech → holder also gets tech; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Research Agreement') return Promise.resolve([{ instanceId: 'ra1', holderPlayerId: 'p2', ownerPlayerId: 'jolnar-player' }])
      return Promise.resolve([])
    })
    // jolnar-player researches 'Neural Motivator' (non-faction tech)
    // Expect: p2 also gets 'Neural Motivator' in game_players.technologies
    // Expect: returnNote('ra1', 'jolnar-player', db)
  })

  it('GIVEN Research Agreement held, Jol-Nar researches faction tech → no copy to holder', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Research Agreement') return Promise.resolve([{ instanceId: 'ra1', holderPlayerId: 'p2', ownerPlayerId: 'jolnar-player' }])
      return Promise.resolve([])
    })
    // Jol-Nar faction tech names: 'E-res Siphons', 'Neuroglaive', 'Pre-Fab Arcologies', 'Quantum Entanglement'
    // Expect: holder does NOT get tech
  })

  it('GIVEN Research Agreement not held → normal research only', async () => {
    getHeldNotes.mockResolvedValue([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-research-technology.phase39b.test.js
```

- [ ] **Step 3: Add Research Agreement hook to `game-research-technology`**

Add imports:
```typescript
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

After tech is added to the researcher's player record:

```typescript
const JOLNAR_FACTION_TECHS = ['e_res_siphons', 'neuroglaive', 'pre_fab_arcologies', 'quantum_entanglement']
// (use canonical snake_case keys matching technology reference data)

const researchAgreementNotes = await getHeldNotes(body.game_id, 'Research Agreement', db)
for (const note of researchAgreementNotes) {
  if (note.ownerPlayerId === player.id) {
    const techKey = (techRow as { key: string }).key  // the researched tech's key
    if (!JOLNAR_FACTION_TECHS.includes(techKey)) {
      // Grant same tech to holder
      const { data: holderPlayer } = await db
        .from('game_players')
        .select('technologies')
        .eq('id', note.holderPlayerId)
        .maybeSingle()
      const holderTechs = ((holderPlayer as { technologies: string[] } | null)?.technologies) ?? []
      if (!holderTechs.includes(techKey)) {
        await db.from('game_players')
          .update({ technologies: [...holderTechs, techKey] })
          .eq('id', note.holderPlayerId)
      }
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-research-technology.phase39b.test.js tests/functions/game-research-technology.test.js tests/functions/game-research-technology.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-research-technology/index.ts ti4-companion-web/tests/functions/game-research-technology.phase39b.test.js
git commit -m "feat: add Research Agreement copy-tech hook to game-research-technology"
```

---

### Task 12: Ragh's Call hook in `game-commit-ground-forces`

**Files:**
- Modify: `supabase/functions/game-commit-ground-forces/index.ts`
- Create: `ti4-companion-web/tests/functions/game-commit-ground-forces.phase39b.test.js`

Read `supabase/functions/game-commit-ground-forces/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-commit-ground-forces.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-commit-ground-forces/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe("Ragh's Call hook", () => {
  it("GIVEN Ragh's Call held by invader, Saar has ground forces on planet → forces ejected to retreat planet; note returned", async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === "Ragh's Call") return Promise.resolve([{ instanceId: 'rc1', holderPlayerId: 'p1', ownerPlayerId: 'saar-player' }])
      return Promise.resolve([])
    })
    // p1 is committing ground forces to planet 'Mecatol Rex'; saar-player has infantry there
    // selections.saar_retreat_planet = 'Jord'
    // Expect: saar's infantry on 'Mecatol Rex' is removed and added to 'Jord'
    // Expect: returnNote called
  })

  it("GIVEN Ragh's Call not held → no ejection", async () => {
    getHeldNotes.mockResolvedValue([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-commit-ground-forces.phase39b.test.js
```

- [ ] **Step 3: Add Ragh's Call hook to `game-commit-ground-forces`**

Add imports:
```typescript
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

After ground forces are committed to the planet, add:

```typescript
const raghsCallNotes = await getHeldNotes(body.game_id, "Ragh's Call", db)
for (const note of raghsCallNotes) {
  if (note.holderPlayerId === player.id) {
    const retreatPlanet = (body.selections as Record<string, string> | undefined)?.saar_retreat_planet
    if (retreatPlanet) {
      // Remove Saar's (note.ownerPlayerId) ground forces from the invaded planet
      const { data: saarUnits } = await db
        .from('game_player_units')
        .select('id, unit_type, count')
        .eq('game_id', body.game_id)
        .eq('player_id', note.ownerPlayerId)
        .eq('planet_name', body.planet_name)
        .in('unit_type', ['infantry', 'mech'])
      if (saarUnits && saarUnits.length > 0) {
        // Delete from invaded planet
        await db.from('game_player_units')
          .delete()
          .eq('game_id', body.game_id)
          .eq('player_id', note.ownerPlayerId)
          .eq('planet_name', body.planet_name)
          .in('unit_type', ['infantry', 'mech'])
        // Add to retreat planet
        for (const unit of saarUnits) {
          await db.from('game_player_units').upsert({
            game_id: body.game_id,
            player_id: note.ownerPlayerId,
            system_key: body.system_key,  // same system as retreat planet
            planet_name: retreatPlanet,
            unit_type: (unit as Record<string, unknown>).unit_type,
            count: (unit as Record<string, unknown>).count,
            on_planet: true,
          }, { onConflict: 'game_id,player_id,system_key,unit_type,planet_name' })
        }
      }
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-commit-ground-forces.phase39b.test.js tests/functions/game-commit-ground-forces.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-commit-ground-forces/index.ts ti4-companion-web/tests/functions/game-commit-ground-forces.phase39b.test.js
git commit -m "feat: add Ragh's Call ground force ejection hook to game-commit-ground-forces"
```

---

### Task 13: Ability hooks in `game-resolve-ability`

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Create: `ti4-companion-web/tests/functions/game-resolve-ability.phase39b.test.js`

Read `supabase/functions/game-resolve-ability/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-resolve-ability.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getActiveNotes: vi.fn().mockResolvedValue({ supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [], bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [] }),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Promise of Protection', () => {
  it('GIVEN Promise of Protection in_play, Mentak (owner) attempts Pillage on holder → 409', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [],
      promiseOfProtection: [{ instanceId: 'pop1', holderPlayerId: 'p2', ownerPlayerId: 'mentak-player' }],
      bloodPact: [], darkPact: [], stymie: [], antivirus: [], giftOfPrescience: [],
      tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // mentak-player activates ability 'pillage'; target_player_id = 'p2'
    // Expect: 409 'Promise of Protection'
  })
})

describe('Antivirus', () => {
  it('GIVEN Antivirus in_play, Nekro (owner) targets holder with Technological Singularity → 409', async () => {
    getActiveNotes.mockResolvedValue({
      supportForThrone: [], alliance: [], tradeConvoys: [], promiseOfProtection: [],
      bloodPact: [], darkPact: [], stymie: [],
      antivirus: [{ instanceId: 'av1', holderPlayerId: 'p2', ownerPlayerId: 'nekro-player' }],
      giftOfPrescience: [], tradeAgreement: [], crucible: [], strikeWingAmbuscade: [],
    })
    // nekro-player activates 'technological_singularity'; target = 'p2'
    // Expect: 409 'Antivirus'
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.phase39b.test.js
```

- [ ] **Step 3: Add hooks to `game-resolve-ability`**

Add import:
```typescript
import { getActiveNotes } from '../_shared/promissoryEnforcement.ts'
```

At the start of ability resolution (after validating the ability key), add:

```typescript
const activeNotes = await getActiveNotes(body.game_id, db)

// Promise of Protection: block Pillage
if (body.ability_key === 'pillage') {
  for (const note of activeNotes.promiseOfProtection) {
    if (note.ownerPlayerId === player.id && note.holderPlayerId === body.target_player_id) {
      return errorResponse('Promise of Protection blocks Pillage', 409)
    }
  }
}

// Antivirus: block Technological Singularity
if (body.ability_key === 'technological_singularity') {
  for (const note of activeNotes.antivirus) {
    if (note.ownerPlayerId === player.id && note.holderPlayerId === body.target_player_id) {
      return errorResponse('Antivirus blocks Technological Singularity', 409)
    }
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.phase39b.test.js tests/functions/game-resolve-ability.test.js tests/functions/game-resolve-ability.phase30.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts ti4-companion-web/tests/functions/game-resolve-ability.phase39b.test.js
git commit -m "feat: add Promise of Protection/Antivirus block hooks to game-resolve-ability"
```

---

### Task 14: Turn-start hooks in `game-end-turn`

**Files:**
- Modify: `supabase/functions/game-end-turn/index.ts`
- Create: `ti4-companion-web/tests/functions/game-end-turn.phase39b.test.js`

Read `supabase/functions/game-end-turn/index.ts` before making changes.

- [ ] **Step 1: Write failing tests**

```js
// ti4-companion-web/tests/functions/game-end-turn.phase39b.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError' } }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_END_TURN: 'end_turn',
}))
vi.mock('../../../supabase/functions/_shared/promissoryEnforcement.ts', () => ({
  getHeldNotes: vi.fn().mockResolvedValue([]),
  returnNote: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getHeldNotes, returnNote } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'
import { handler } from '../../../supabase/functions/game-end-turn/index.ts'

beforeEach(() => { vi.clearAllMocks(); requireAuth.mockResolvedValue('user') })

describe('Cybernetic Enhancements hook', () => {
  it('GIVEN Cybernetic Enhancements held, L1Z1X about to act → L1Z1X −1 strategy token; holder +1 strategy token; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Cybernetic Enhancements') return Promise.resolve([{ instanceId: 'ce1', holderPlayerId: 'p2', ownerPlayerId: 'l1z1x-player' }])
      return Promise.resolve([])
    })
    // l1z1x-player is the next active player
    // Expect: l1z1x-player command_tokens strategy −1; p2 command_tokens strategy +1
    // Expect: returnNote called
  })
})

describe('Military Support hook', () => {
  it('GIVEN Military Support held, Sol about to act → Sol −1 strategy token; holder places 2 infantry; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Military Support') return Promise.resolve([{ instanceId: 'ms1', holderPlayerId: 'p2', ownerPlayerId: 'sol-player' }])
      return Promise.resolve([])
    })
    // sol-player is next active player; selections includes infantry_planet
    // Expect: sol −1 strategy token; 2 infantry inserted for p2 on selections.infantry_planet
  })
})

describe('Spy Net hook', () => {
  it('GIVEN Spy Net held, holder about to act → Yssaril card stolen; note returned', async () => {
    getHeldNotes.mockImplementation((gameId, name) => {
      if (name === 'Spy Net') return Promise.resolve([{ instanceId: 'sn1', holderPlayerId: 'p1', ownerPlayerId: 'yssaril-player' }])
      return Promise.resolve([])
    })
    // p1 is next active player; selections.stolen_card_id = 'card-uuid'
    // Expect: card-uuid transferred from yssaril to p1 in game_player_action_cards
    // Expect: returnNote called
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-end-turn.phase39b.test.js
```

- [ ] **Step 3: Add turn-start hooks to `game-end-turn`**

Add imports:
```typescript
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'
```

After determining `nextActivePlayerId` (the player who will take the next turn), add:

```typescript
// Cybernetic Enhancements: triggers when L1Z1X (owner) is about to act
const cyberneticNotes = await getHeldNotes(body.game_id, 'Cybernetic Enhancements', db)
for (const note of cyberneticNotes) {
  if (note.ownerPlayerId === nextActivePlayerId) {
    // L1Z1X loses 1 strategy token
    const { data: l1z1xPlayer } = await db.from('game_players').select('command_tokens').eq('id', note.ownerPlayerId).maybeSingle()
    const l1z1xTokens = (l1z1xPlayer as { command_tokens: { tactic_total: number; fleet: number; strategy: number } } | null)?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
    await db.from('game_players').update({ command_tokens: { ...l1z1xTokens, strategy: Math.max(0, l1z1xTokens.strategy - 1) } }).eq('id', note.ownerPlayerId)
    // Holder gains 1 strategy token
    const { data: holderPlayer } = await db.from('game_players').select('command_tokens').eq('id', note.holderPlayerId).maybeSingle()
    const holderTokens = (holderPlayer as { command_tokens: { tactic_total: number; fleet: number; strategy: number } } | null)?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
    await db.from('game_players').update({ command_tokens: { ...holderTokens, strategy: holderTokens.strategy + 1 } }).eq('id', note.holderPlayerId)
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}

// Military Support: triggers when Sol (owner) is about to act
const militarySupportNotes = await getHeldNotes(body.game_id, 'Military Support', db)
for (const note of militarySupportNotes) {
  if (note.ownerPlayerId === nextActivePlayerId) {
    // Sol loses 1 strategy token
    const { data: solPlayer } = await db.from('game_players').select('command_tokens').eq('id', note.ownerPlayerId).maybeSingle()
    const solTokens = (solPlayer as { command_tokens: { tactic_total: number; fleet: number; strategy: number } } | null)?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
    await db.from('game_players').update({ command_tokens: { ...solTokens, strategy: Math.max(0, solTokens.strategy - 1) } }).eq('id', note.ownerPlayerId)
    // Place 2 infantry for holder on selected planet
    const infantryPlanet = (body.selections as Record<string, string> | undefined)?.infantry_planet
    if (infantryPlanet) {
      const { data: existingUnit } = await db.from('game_player_units').select('count').eq('game_id', body.game_id).eq('player_id', note.holderPlayerId).eq('unit_type', 'infantry').eq('planet_name', infantryPlanet).maybeSingle()
      const currentCount = (existingUnit as { count: number } | null)?.count ?? 0
      await db.from('game_player_units').upsert({
        game_id: body.game_id, player_id: note.holderPlayerId, unit_type: 'infantry',
        planet_name: infantryPlanet, count: currentCount + 2, on_planet: true,
      }, { onConflict: 'game_id,player_id,system_key,unit_type,planet_name' })
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}

// Spy Net: triggers when the holder is about to act
const spyNetNotes = await getHeldNotes(body.game_id, 'Spy Net', db)
for (const note of spyNetNotes) {
  if (note.holderPlayerId === nextActivePlayerId) {
    const stolenCardId = (body.selections as Record<string, string> | undefined)?.stolen_card_id
    if (stolenCardId) {
      // Transfer card from Yssaril (ownerPlayerId) to holder
      await db.from('game_player_action_cards')
        .update({ player_id: note.holderPlayerId })
        .eq('id', stolenCardId)
        .eq('player_id', note.ownerPlayerId)
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }
}
```

- [ ] **Step 4: Complete mockDb in tests and run**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-end-turn.phase39b.test.js tests/functions/game-end-turn.test.js tests/functions/game-end-turn.phase30.test.js
```

Expected: all pass.

- [ ] **Step 5: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-end-turn/index.ts ti4-companion-web/tests/functions/game-end-turn.phase39b.test.js
git commit -m "feat: add Cybernetic Enhancements/Military Support/Spy Net turn-start hooks to game-end-turn"
```

---

### Task 15: Deploy Phase 39b

- [ ] **Step 1: Deploy all modified functions**

```bash
supabase functions deploy game-confirm-transaction --no-verify-jwt
supabase functions deploy game-activate-system --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
supabase functions deploy game-create-transaction --no-verify-jwt
supabase functions deploy game-cast-votes --no-verify-jwt
supabase functions deploy game-produce-units --no-verify-jwt
supabase functions deploy game-roll-combat-dice --no-verify-jwt
supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
supabase functions deploy game-fire-anti-fighter-barrage --no-verify-jwt
supabase functions deploy game-fire-space-cannon --no-verify-jwt
supabase functions deploy game-research-technology --no-verify-jwt
supabase functions deploy game-commit-ground-forces --no-verify-jwt
supabase functions deploy game-resolve-ability --no-verify-jwt
supabase functions deploy game-end-turn --no-verify-jwt
```

- [ ] **Step 2: Smoke test with held notes**

In a test game: create a game_player_promissory_notes row with state='held' for a Model D note (e.g. Ceasefire). Trigger the relevant function and verify the enforcement fires.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "feat: phase 39b complete — all promissory enforcement hooks wired"
```
