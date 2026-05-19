# Phase 39a: Promissory Note DSL Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `interpretEffects` / `resolvePromissoryHandler` into `game-play-promissory-note`; add `purge_relic_fragments` DSL op; stub all 26 promissory handlers; extend `promissoryEnforcement.ts` with `getHeldNotes`.

**Architecture:** Migration 048 adds metadata and terraform_attached columns. `abilityDsl.ts` gains a new op and two ResolveContext fields. A new `promissoryHandlers.ts` file holds all stubs (throwing 501). `game-play-promissory-note` is updated to dispatch to DSL or handler. Black Market Forgery becomes the first note fully wired via pure DSL.

**Tech Stack:** Deno/TypeScript Edge Functions, Supabase JS v2, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/048_promissory_dsl.sql` |
| Modify | `supabase/functions/_shared/abilityDsl.ts` |
| Create | `supabase/functions/_shared/promissoryHandlers.ts` |
| Modify | `supabase/functions/_shared/promissoryEnforcement.ts` |
| Modify | `supabase/functions/game-play-promissory-note/index.ts` |
| Modify | `ti4-companion-web/tests/functions/game-play-promissory-note.test.js` |
| Create | `ti4-companion-web/tests/functions/game-play-promissory-note.phase39a.test.js` |

---

### Task 1: Migration 048

**Files:**
- Create: `supabase/migrations/048_promissory_dsl.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/048_promissory_dsl.sql

ALTER TABLE game_player_promissory_notes
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE game_player_planets
  ADD COLUMN IF NOT EXISTS terraform_attached BOOLEAN NOT NULL DEFAULT false;

-- Terraform goes permanently into the play area; the existing state-transition
-- logic in game-play-promissory-note handles in_play based on this flag.
UPDATE promissory_notes SET into_play_area = true WHERE name = 'Terraform';
```

- [ ] **Step 2: Verify the migration applies cleanly**

```bash
supabase db reset
```

Expected: no errors; `game_player_promissory_notes.metadata` and `game_player_planets.terraform_attached` columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_promissory_dsl.sql
git commit -m "feat: add migration 048 — promissory DSL columns (metadata, terraform_attached)"
```

---

### Task 2: Extend ResolveContext and add `purge_relic_fragments` op

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

Read `supabase/functions/_shared/abilityDsl.ts` before making changes.

- [ ] **Step 1: Write failing test for purge_relic_fragments**

Create `ti4-companion-web/tests/shared/abilityDsl.purge-relic-fragments.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

function makeCtx(overrides = {}) {
  return {
    gameId: GAME_ID,
    activatingPlayerId: PLAYER_ID,
    selections: { fragment_type: 'cultural' },
    ...overrides,
  }
}

function makeDb({ frags = [{ id: 'f1' }, { id: 'f2' }], fragsError = null, discardError = null, playerError = null } = {}) {
  const { db } = require('../../../supabase/functions/_shared/db.ts')
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {}, faction: 'sol' }, error: playerError }),
          }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: frags, error: fragsError }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: discardError }),
        }),
      }
    }
  })
  return db
}

describe('purge_relic_fragments op', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('discards count fragments and succeeds', async () => {
    const db = makeDb({ frags: [{ id: 'f1' }, { id: 'f2' }] })
    await expect(
      interpretEffects([{ op: 'purge_relic_fragments', count: 2 }], makeCtx(), db)
    ).resolves.toBeUndefined()
    expect(db.from('game_exploration_decks').update).toBeDefined()
  })

  it('throws 409 if insufficient fragments', async () => {
    const db = makeDb({ frags: [{ id: 'f1' }] })
    await expect(
      interpretEffects([{ op: 'purge_relic_fragments', count: 2 }], makeCtx(), db)
    ).rejects.toMatchObject({ message: expect.stringContaining('Insufficient') })
  })

  it('throws if fragment_type missing from selections', async () => {
    const db = makeDb()
    await expect(
      interpretEffects([{ op: 'purge_relic_fragments', count: 2 }], makeCtx({ selections: {} }), db)
    ).rejects.toMatchObject({ message: expect.stringContaining('fragment_type') })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/shared/abilityDsl.purge-relic-fragments.test.js
```

Expected: FAIL — `purge_relic_fragments` is not a known op.

- [ ] **Step 3: Add `noteInstanceId`/`noteOriginPlayerId` to ResolveContext**

In `supabase/functions/_shared/abilityDsl.ts`, after `selections?: Record<string, unknown>`:

```typescript
noteInstanceId?: string
noteOriginPlayerId?: string
```

- [ ] **Step 4: Add `purge_relic_fragments` case to `interpretOp`**

In `abilityDsl.ts`, inside `interpretOp` switch, before `default:`:

```typescript
case 'purge_relic_fragments': {
  const fragType = (sel as Record<string, string>).fragment_type
  if (!fragType) throw dslError('fragment_type required in selections for purge_relic_fragments')
  const count = op.count as number
  const { data: frags, error: fragsError } = await db
    .from('game_exploration_decks')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('resolved_by_player_id', context.activatingPlayerId)
    .eq('relic_fragment_type', fragType)
    .eq('state', 'held')
    .limit(count)
  if (fragsError) throw dslError('Failed to query relic fragments', 500)
  const fragList = (frags ?? []) as { id: string }[]
  if (fragList.length < count) throw dslError(`Insufficient ${fragType} relic fragments`)
  const { error: discardError } = await db
    .from('game_exploration_decks')
    .update({ state: 'discarded', resolved_by_player_id: null })
    .in('id', fragList.map(f => f.id))
  if (discardError) throw dslError('Failed to discard relic fragments', 500)
  break
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/shared/abilityDsl.purge-relic-fragments.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
cd ti4-companion-web && npm test
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/shared/abilityDsl.purge-relic-fragments.test.js
git commit -m "feat: add purge_relic_fragments DSL op and noteInstanceId/noteOriginPlayerId to ResolveContext"
```

---

### Task 3: Create `promissoryHandlers.ts` stubs

**Files:**
- Create: `supabase/functions/_shared/promissoryHandlers.ts`

- [ ] **Step 1: Write failing test**

Create `ti4-companion-web/tests/shared/promissoryHandlers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'

const CTX = { gameId: 'g', activatingPlayerId: 'p' }
const DB = {}

const KNOWN_KEYS = [
  'ceasefire', 'politicalSecret', 'politicalFavor', 'acquiescence',
  'firesOfTheGashlai', 'creussIff', 'terraform', 'warFunding',
  'tekklarLegion', 'theCavalry', 'researchAgreement', 'cyberneticEnhancements',
  'militarySupport', 'raghsCall', 'greyfireMutagen', 'spyNet',
  'scepterOfDominion', 'strikeWingAmbuscade', 'crucible', 'tradeConvoys',
  'promiseOfProtection', 'bloodPact', 'darkPact', 'stymie',
  'antivirus', 'giftOfPrescience',
]

describe('resolvePromissoryHandler stubs', () => {
  for (const key of KNOWN_KEYS) {
    it(`${key} throws 501 not yet implemented`, async () => {
      await expect(resolvePromissoryHandler(key, CTX, DB)).rejects.toMatchObject({
        message: expect.stringContaining('not yet implemented'),
        status: 501,
      })
    })
  }

  it('unknown key throws 400', async () => {
    await expect(resolvePromissoryHandler('nonexistent', CTX, DB)).rejects.toMatchObject({
      status: 400,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/shared/promissoryHandlers.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `promissoryHandlers.ts`**

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'
import { dslError } from './abilityDsl.ts'

export async function resolvePromissoryHandler(
  key: string,
  ctx: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  switch (key) {
    case 'ceasefire':
    case 'politicalSecret':
    case 'politicalFavor':
    case 'acquiescence':
    case 'firesOfTheGashlai':
    case 'creussIff':
    case 'terraform':
    case 'warFunding':
    case 'tekklarLegion':
    case 'theCavalry':
    case 'researchAgreement':
    case 'cyberneticEnhancements':
    case 'militarySupport':
    case 'raghsCall':
    case 'greyfireMutagen':
    case 'spyNet':
    case 'scepterOfDominion':
    case 'strikeWingAmbuscade':
    case 'crucible':
    case 'tradeConvoys':
    case 'promiseOfProtection':
    case 'bloodPact':
    case 'darkPact':
    case 'stymie':
    case 'antivirus':
    case 'giftOfPrescience':
      throw dslError(`Promissory handler '${key}' not yet implemented`, 501)
    default:
      throw dslError(`Unknown promissory handler '${key}'`, 400)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/shared/promissoryHandlers.test.js
```

Expected: PASS (27 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/promissoryHandlers.ts ti4-companion-web/tests/shared/promissoryHandlers.test.js
git commit -m "feat: add promissoryHandlers.ts with all 26 handler stubs (501)"
```

---

### Task 4: Extend `promissoryEnforcement.ts`

**Files:**
- Modify: `supabase/functions/_shared/promissoryEnforcement.ts`

Read `supabase/functions/_shared/promissoryEnforcement.ts` before making changes.

- [ ] **Step 1: Write failing tests**

Create `ti4-companion-web/tests/shared/promissoryEnforcement.phase39a.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHeldNotes, getActiveNotes } from '../../../supabase/functions/_shared/promissoryEnforcement.ts'

const GAME_ID = 'game-uuid'

function makeDb({ rows = [], error = null } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows, error }),
        }),
      }),
    }),
  }
}

describe('getHeldNotes', () => {
  it('returns entries matching noteName (case-insensitive)', async () => {
    const rows = [
      { id: 'n1', held_by_player_id: 'p1', origin_player_id: 'p2', promissory_notes: { name: 'Ceasefire' } },
      { id: 'n2', held_by_player_id: 'p3', origin_player_id: 'p4', promissory_notes: { name: 'Trade Agreement' } },
    ]
    const db = makeDb({ rows })
    const result = await getHeldNotes(GAME_ID, 'Ceasefire', db)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ instanceId: 'n1', holderPlayerId: 'p1', ownerPlayerId: 'p2' })
  })

  it('returns empty array when no matching held notes', async () => {
    const db = makeDb({ rows: [] })
    const result = await getHeldNotes(GAME_ID, 'Ceasefire', db)
    expect(result).toHaveLength(0)
  })

  it('throws when DB error occurs', async () => {
    const db = makeDb({ error: new Error('DB fail') })
    await expect(getHeldNotes(GAME_ID, 'Ceasefire', db)).rejects.toThrow()
  })
})

describe('getActiveNotes includes new keys', () => {
  it('initializes tradeAgreement, crucible, strikeWingAmbuscade in result', async () => {
    const db = makeDb({ rows: [] })
    const result = await getActiveNotes(GAME_ID, db)
    expect(result).toHaveProperty('tradeAgreement')
    expect(result).toHaveProperty('crucible')
    expect(result).toHaveProperty('strikeWingAmbuscade')
    expect(result.tradeAgreement).toEqual([])
    expect(result.crucible).toEqual([])
    expect(result.strikeWingAmbuscade).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/shared/promissoryEnforcement.phase39a.test.js
```

Expected: FAIL — `getHeldNotes` not exported; tradeAgreement key missing.

- [ ] **Step 3: Update `ActiveNotes` interface — add three keys**

In `promissoryEnforcement.ts`, update `ActiveNotes`:

```typescript
export interface ActiveNotes {
  supportForThrone: NoteEntry[]
  alliance: NoteEntry[]
  tradeConvoys: NoteEntry[]
  promiseOfProtection: NoteEntry[]
  bloodPact: NoteEntry[]
  darkPact: NoteEntry[]
  stymie: NoteEntry[]
  antivirus: NoteEntry[]
  giftOfPrescience: NoteEntry[]
  tradeAgreement: NoteEntry[]
  crucible: NoteEntry[]
  strikeWingAmbuscade: NoteEntry[]
}
```

- [ ] **Step 4: Add name mappings in `nameToKey`**

Add after the `'gift of prescience'` mapping:

```typescript
if (normalized === 'trade agreement') return 'tradeAgreement'
if (normalized === 'crucible') return 'crucible'
if (normalized === 'strike wing ambuscade') return 'strikeWingAmbuscade'
```

- [ ] **Step 5: Initialize new keys in `getActiveNotes`**

Add to the `result` object:

```typescript
tradeAgreement: [],
crucible: [],
strikeWingAmbuscade: [],
```

- [ ] **Step 6: Add `getHeldNotes` function**

Append after `returnNote`:

```typescript
/**
 * Returns all held (state='held') promissory notes matching noteName, for Model D passive triggers.
 */
export async function getHeldNotes(
  gameId: string,
  noteName: string,
  db: SupabaseClient
): Promise<NoteEntry[]> {
  const { data, error } = await db
    .from('game_player_promissory_notes')
    .select('id, held_by_player_id, origin_player_id, promissory_notes(name)')
    .eq('game_id', gameId)
    .eq('state', 'held')

  if (error) throw new Error(`Failed to load held notes: ${error.message}`)
  if (!data) return []

  const lowerName = noteName.toLowerCase()
  return (data as Array<{
    id: string
    held_by_player_id: string
    origin_player_id: string
    promissory_notes: { name: string } | null
  }>)
    .filter(row => (row.promissory_notes?.name ?? '').toLowerCase() === lowerName)
    .map(row => ({
      instanceId: row.id,
      holderPlayerId: row.held_by_player_id,
      ownerPlayerId: row.origin_player_id,
    }))
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/shared/promissoryEnforcement.phase39a.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/promissoryEnforcement.ts ti4-companion-web/tests/shared/promissoryEnforcement.phase39a.test.js
git commit -m "feat: add getHeldNotes and extend ActiveNotes with tradeAgreement/crucible/strikeWingAmbuscade"
```

---

### Task 5: Wire `game-play-promissory-note`

**Files:**
- Modify: `supabase/functions/game-play-promissory-note/index.ts`

Read `supabase/functions/game-play-promissory-note/index.ts` before making changes.

- [ ] **Step 1: Add imports at top of file**

Replace the existing import block (add two new imports):

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_PLAY_PROMISSORY_NOTE } from '../_shared/gameEvents.ts'
import { interpretEffects, type ResolveContext } from '../_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../_shared/promissoryHandlers.ts'
```

- [ ] **Step 2: Fix abilitySource query — add error capture**

Replace the existing query (which discards `error`):

```typescript
const { data: abilitySource, error: abilitySourceError } = await db
  .from('ability_sources')
  .select('ability_definition_id, ability_definitions(id, handler_key, effects)')
  .eq('source_type', 'promissory_note')
  .eq('source_id', noteRow.note_id)
  .maybeSingle()
if (abilitySourceError) return errorResponse('Database error', 500)
if (!abilitySource) return errorResponse('No ability definition for this note', 404)
```

- [ ] **Step 3: Add dispatch block after the abilitySource check**

Insert after the `if (!abilitySource)` guard (before `const { data: noteRefData...`):

```typescript
const abilityDef = abilitySource.ability_definitions as {
  id: string
  handler_key: string | null
  effects: unknown[] | null
} | null
if (!abilityDef) return errorResponse('No ability definition for this note', 404)

const ctx: ResolveContext = {
  gameId: body.game_id,
  activatingPlayerId: player.id,
  noteInstanceId: body.note_instance_id,
  noteOriginPlayerId: noteRow.origin_player_id,
  selections: body.selections,
}

try {
  const effects = abilityDef.effects
  if (effects && (effects as unknown[]).length > 0) {
    await interpretEffects(effects, ctx, db)
  } else if (abilityDef.handler_key) {
    await resolvePromissoryHandler(abilityDef.handler_key, ctx, db)
  }
} catch (e: unknown) {
  const err = e as Error & { status?: number }
  const status = err.status === 409 ? 409 : err.status === 501 ? 501 : 500
  return errorResponse(err.message ?? 'Failed to resolve ability', status)
}
```

- [ ] **Step 4: Remove commented-out lines**

Delete these two lines from the file:

```typescript
  // Full ability resolution wired in Phase 30; for now we just track the play
  // const _abilityDef = abilitySource.ability_definitions as Record<string, unknown>
  // const _selections = body.selections ?? {}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-play-promissory-note/index.ts
git commit -m "feat: wire interpretEffects / resolvePromissoryHandler dispatch in game-play-promissory-note"
```

---

### Task 6: Update tests for `game-play-promissory-note`

**Files:**
- Modify: `ti4-companion-web/tests/functions/game-play-promissory-note.test.js`
- Create: `ti4-companion-web/tests/functions/game-play-promissory-note.phase39a.test.js`

Read `ti4-companion-web/tests/functions/game-play-promissory-note.test.js` before making changes.

- [ ] **Step 1: Add mocks to existing test file**

At the top of the existing test file, after the `vi.mock` for `gameEvents.ts`, add:

```js
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/promissoryHandlers.ts', () => ({
  resolvePromissoryHandler: vi.fn().mockResolvedValue(undefined),
}))
```

Also add these imports after the existing imports:

```js
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
```

- [ ] **Step 2: Run existing tests to confirm they still pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: all existing tests PASS (the mock prevents 501 from stubs).

- [ ] **Step 3: Write new dispatch tests**

Create `ti4-companion-web/tests/functions/game-play-promissory-note.phase39a.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  EVT_PLAY_PROMISSORY_NOTE: 'play_promissory_note',
}))

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/promissoryHandlers.ts', () => ({
  resolvePromissoryHandler: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
import { handler } from '../../../supabase/functions/game-play-promissory-note/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'
const ORIGIN_PLAYER_ID = 'origin-player-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'
const NOTE_ID = 'note-uuid'
const ABILITY_DEF_ID = 'ability-def-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-play-promissory-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ abilityDef = { id: ABILITY_DEF_ID, handler_key: 'tradeConvoys', effects: null } } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID }, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: NOTE_INSTANCE_ID, state: 'held', held_by_player_id: PLAYER_ID, note_id: NOTE_ID, origin_player_id: ORIGIN_PLAYER_ID },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ability_definition_id: ABILITY_DEF_ID, ability_definitions: abilityDef },
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'promissory_notes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { purge_on_use: false, into_play_area: false }, error: null }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-play-promissory-note phase 39a dispatch', () => {
  it('calls resolvePromissoryHandler when handler_key is set and effects is null', async () => {
    mockDb({ abilityDef: { id: ABILITY_DEF_ID, handler_key: 'tradeConvoys', effects: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    expect(resolvePromissoryHandler).toHaveBeenCalledWith('tradeConvoys', expect.objectContaining({
      gameId: GAME_ID,
      activatingPlayerId: PLAYER_ID,
      noteInstanceId: NOTE_INSTANCE_ID,
      noteOriginPlayerId: ORIGIN_PLAYER_ID,
    }), expect.anything())
  })

  it('calls interpretEffects when effects array is non-empty', async () => {
    const effects = [{ op: 'purge_relic_fragments', count: 2 }, { op: 'gain_relic' }]
    mockDb({ abilityDef: { id: ABILITY_DEF_ID, handler_key: null, effects } })
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledWith(effects, expect.objectContaining({
      gameId: GAME_ID,
      activatingPlayerId: PLAYER_ID,
    }), expect.anything())
  })

  it('returns 409 when resolvePromissoryHandler throws dslError status 409', async () => {
    resolvePromissoryHandler.mockRejectedValueOnce(Object.assign(new Error('Precondition failed'), { status: 409 }))
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 501 when resolvePromissoryHandler throws dslError status 501', async () => {
    resolvePromissoryHandler.mockRejectedValueOnce(Object.assign(new Error('not yet implemented'), { status: 501 }))
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(501)
  })

  it('returns 500 when resolvePromissoryHandler throws generic error', async () => {
    resolvePromissoryHandler.mockRejectedValueOnce(new Error('unexpected'))
    const res = await handler(makeRequest({ game_id: GAME_ID, note_instance_id: NOTE_INSTANCE_ID }))
    expect(res.status).toBe(500)
  })

  it('passes selections in context when provided', async () => {
    mockDb({ abilityDef: { id: ABILITY_DEF_ID, handler_key: 'terraform', effects: null } })
    const res = await handler(makeRequest({
      game_id: GAME_ID,
      note_instance_id: NOTE_INSTANCE_ID,
      selections: { planet_name: 'Mecatol Rex' },
    }))
    expect(res.status).toBe(200)
    expect(resolvePromissoryHandler).toHaveBeenCalledWith('terraform', expect.objectContaining({
      selections: { planet_name: 'Mecatol Rex' },
    }), expect.anything())
  })
})
```

- [ ] **Step 4: Run new tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.phase39a.test.js
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/tests/functions/game-play-promissory-note.test.js ti4-companion-web/tests/functions/game-play-promissory-note.phase39a.test.js
git commit -m "test: add phase 39a dispatch tests for game-play-promissory-note"
```

---

### Task 7: Deploy Phase 39a

- [ ] **Step 1: Apply migration to staging/production**

```bash
supabase db push
```

- [ ] **Step 2: Deploy changed Edge Functions**

```bash
supabase functions deploy game-play-promissory-note --no-verify-jwt
```

- [ ] **Step 3: Smoke test**

Attempt to play a promissory note in a test game. Expect 501 (handler not yet implemented) for handler-backed notes. Black Market Forgery should succeed if relic fragments are held (purge_relic_fragments + gain_relic chain).

- [ ] **Step 4: Final commit tagging phase 39a complete**

```bash
git commit --allow-empty -m "feat: phase 39a complete — promissory note DSL plumbing"
```
