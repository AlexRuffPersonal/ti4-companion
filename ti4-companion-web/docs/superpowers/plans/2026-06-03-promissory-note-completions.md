# Promissory Note Completions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Black Market Forgery handler, fix the broken ability dispatch (wrong column names), move Terraform inline logic to its handler, make admin re-import idempotent, and add missing state constraint.

**Architecture:** Five independent fixes addressed top-down from DB layer (migration) through backend (edge functions + handlers) to frontend (modal components). Each task is self-contained and testable before the next begins.

**Tech Stack:** Deno/TypeScript (Edge Functions), PostgreSQL (migration), React 19 + Vitest (frontend)

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/054_promissory_state.sql` | New — extend state CHECK |
| `supabase/functions/game-play-promissory-note/index.ts` | Fix column names; merge planet_name; remove Terraform inline block |
| `supabase/functions/_shared/promissoryHandlers.ts` | Add blackMarketForgery; no-op stubs; extend terraform |
| `supabase/functions/admin-import-promissory-notes/index.ts` | Re-seed ability_definitions + ability_sources after import |
| `src/lib/edgeFunctions.js` | Update playPromissoryNote to options object |
| `src/hooks/useGame.js` | Update playTheNote; add myRelicFragments |
| `src/components/game/GameScreen.jsx` | Pass myRelicFragments; update handlePlayNote |
| `src/components/game/PromissoryNotesModal.jsx` | Extend needsSubModal; pass myRelicFragments |
| `src/components/game/PlayPromissoryNoteModal.jsx` | Add fragment picker for Black Market Forgery |
| `tests/functions/game-play-promissory-note.test.js` | Fix mock keys; add planet_name merge test |
| `tests/lib/promissoryHandlers.phase45.test.js` | New — blackMarketForgery + terraform + no-op stubs |
| `tests/functions/admin-import-promissory-notes.test.js` | Verify ability seeding |
| `tests/lib/edgeFunctions.phase45.test.js` | New — playPromissoryNote options |
| `tests/hooks/useGame.phase45.test.js` | New — playTheNote options; myRelicFragments |
| `tests/components/game/PromissoryNotesModal.test.jsx` | Black Market Forgery sub-modal; options callback |
| `tests/components/game/PlayPromissoryNoteModal.test.jsx` | Fragment picker validation |

---

## Task 1: DB Migration — extend state CHECK to include 'discarded'

**Files:**
- Create: `supabase/migrations/054_promissory_state.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/054_promissory_state.sql
ALTER TABLE public.game_player_promissory_notes
  DROP CONSTRAINT game_player_promissory_notes_state_check;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play', 'discarded'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/054_promissory_state.sql
git commit -m "feat(p45): add 'discarded' to game_player_promissory_notes state CHECK"
```

---

## Task 2: Fix broken column names in game-play-promissory-note

The `ability_sources` query uses `ability_definition_id` and `handler_key` — both wrong. The DB columns are `ability_id` and `handler`. This means `resolvePromissoryHandler` is never called in production. Fix the query and the test mock.

**Files:**
- Modify: `supabase/functions/game-play-promissory-note/index.ts:48-60`
- Modify: `tests/functions/game-play-promissory-note.test.js:57`

- [ ] **Step 1: Update the mock to use correct column names (makes existing tests fail)**

In `tests/functions/game-play-promissory-note.test.js`, find the `mockDb` default parameter at line ~57:

```js
// OLD:
abilitySource = { ability_definition_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler_key: 'test_handler', effects: [] } },
```

Change to:

```js
// NEW:
abilitySource = { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'test_handler', effects: [] } },
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: tests that check `resolvePromissoryHandler` was called will fail (handler dispatch now broken due to mock/impl mismatch).

- [ ] **Step 3: Fix the implementation — correct column names**

In `supabase/functions/game-play-promissory-note/index.ts`, find lines ~48-60:

```ts
// OLD:
const { data: abilitySource, error: abilitySourceError } = await db
  .from('ability_sources')
  .select('ability_definition_id, ability_definitions(id, handler_key, effects)')
  .eq('source_type', 'promissory_note')
  .eq('source_id', noteRow.note_id)
  .maybeSingle()

if (abilitySourceError) return errorResponse('Database error', 500)
if (!abilitySource) return errorResponse('No ability definition for this note', 404)

const abilityDef = abilitySource.ability_definitions as { id: string; handler_key: string | null; effects: unknown[] } | null
const effects = abilityDef?.effects ?? []
const handlerKey = abilityDef?.handler_key ?? null
```

Replace with:

```ts
const { data: abilitySource, error: abilitySourceError } = await db
  .from('ability_sources')
  .select('ability_id, ability_definitions(id, handler, effects)')
  .eq('source_type', 'promissory_note')
  .eq('source_id', noteRow.note_id)
  .maybeSingle()

if (abilitySourceError) return errorResponse('Database error', 500)
if (!abilitySource) return errorResponse('No ability definition for this note', 404)

const abilityDef = abilitySource.ability_definitions as { id: string; handler: string | null; effects: unknown[] } | null
const effects = abilityDef?.effects ?? []
const handlerKey = abilityDef?.handler ?? null
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: PASS — all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-play-promissory-note/index.ts tests/functions/game-play-promissory-note.test.js
git commit -m "fix(p45): correct ability_sources column names (ability_id, handler)"
```

---

## Task 3: Terraform refactor — move attachment logic to handler, remove inline block

The inline `if (noteRefData?.name === 'Terraform')` block in `game-play-promissory-note` was also unreachable (name wasn't selected). Move all attachment validation + attachment logic to `promissoryHandlers.ts`; merge `body.planet_name` into `selections` so the handler receives it.

**Files:**
- Modify: `supabase/functions/game-play-promissory-note/index.ts`
- Modify: `supabase/functions/_shared/promissoryHandlers.ts:189-212`
- Modify: `tests/functions/game-play-promissory-note.test.js`
- Modify: `tests/lib/promissoryHandlers.phase39c.test.js` (add terraform integration tests here or in phase45 file — use phase45)

- [ ] **Step 1: Write failing test for planet_name merge**

In `tests/functions/game-play-promissory-note.test.js`, add a test inside the main `describe` block:

```js
it('merges body.planet_name into ctx.selections.planet_name', async () => {
  mockDb({
    abilitySource: { ability_id: ABILITY_DEF_ID, ability_definitions: { id: ABILITY_DEF_ID, handler: 'terraform', effects: [] } },
    noteRef: { purge_on_use: false, into_play_area: true },
  })
  const res = await handler(makeRequest({
    game_id: GAME_ID,
    note_instance_id: NOTE_INSTANCE_ID,
    planet_name: 'Mecatol Rex',
  }))
  expect(res.status).toBe(200)
  expect(resolvePromissoryHandler).toHaveBeenCalledWith(
    'terraform',
    expect.objectContaining({ selections: expect.objectContaining({ planet_name: 'Mecatol Rex' }) }),
    expect.anything()
  )
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: FAIL — `planet_name` not in selections.

- [ ] **Step 3: Merge body.planet_name into selections in game-play-promissory-note**

In `game-play-promissory-note/index.ts`, after:
```ts
const selections = (body.selections ?? {}) as Record<string, unknown>
```

Add:
```ts
if (body.planet_name && typeof body.planet_name === 'string') {
  selections.planet_name = body.planet_name
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run tests/functions/game-play-promissory-note.test.js
```

Expected: PASS.

- [ ] **Step 5: Write terraform handler tests**

Create `tests/lib/promissoryHandlers.phase45.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  applyAbility: vi.fn().mockResolvedValue({ gainedRelicName: null }),
  dslError: (msg, status) => Object.assign(new Error(msg), { status: status ?? 400 }),
}))
vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn().mockResolvedValue(undefined),
}))

import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'

const GAME_ID = 'game-uuid'
const HOLDER_ID = 'holder-uuid'
const ORIGIN_ID = 'origin-uuid'
const NOTE_INSTANCE_ID = 'note-instance-uuid'

function makeCtx(overrides = {}) {
  return {
    gameId: GAME_ID,
    activatingPlayerId: HOLDER_ID,
    noteOriginPlayerId: ORIGIN_ID,
    noteInstanceId: NOTE_INSTANCE_ID,
    selections: {},
    ...overrides,
  }
}

// ── no-op stubs ──────────────────────────────────────────────────────────────

describe('supportForThrone no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('supportForThrone', makeCtx(), db)).resolves.toBeUndefined()
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe('alliance no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('alliance', makeCtx(), db)).resolves.toBeUndefined()
  })
})

describe('tradeAgreement no-op', () => {
  it('resolves without throwing', async () => {
    const db = { from: vi.fn() }
    await expect(resolvePromissoryHandler('tradeAgreement', makeCtx(), db)).resolves.toBeUndefined()
  })
})

// ── terraform ────────────────────────────────────────────────────────────────

describe('terraform', () => {
  const PLANET_ROW_ID = 'planet-row-uuid'
  const ATTACHMENT_ID = 'attachment-uuid'

  function makeTerraformDb({ planetRow = { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'blue' } }, attachmentRow = { id: ATTACHMENT_ID }, planetUpdateErr = null, metaUpdateErr = null, tfUpdateErr = null } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'game_player_planets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: planetRow, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: tfUpdateErr }),
                }),
              }),
            }),
          }
        }
        if (table === 'attachments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: attachmentRow, error: null }),
          }
        }
        if (table === 'game_player_promissory_notes') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: metaUpdateErr }),
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }
  }

  it('409 when planet not controlled by activating player', async () => {
    const db = makeTerraformDb({ planetRow: null })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Mecatol Rex' } }), db).catch(e => e)
    expect(err.message).toMatch(/not controlled/i)
    expect(err.status).toBe(409)
  })

  it('409 when tile type is faction (home planet)', async () => {
    const db = makeTerraformDb({ planetRow: { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'faction' } } })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Trykk' } }), db).catch(e => e)
    expect(err.message).toMatch(/home planet/i)
  })

  it('409 when planet is Mecatol Rex', async () => {
    const db = makeTerraformDb({ planetRow: { id: PLANET_ROW_ID, attachments: [], tiles: { type: 'blue' } } })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Mecatol Rex' } }), db).catch(e => e)
    expect(err.message).toMatch(/Mecatol Rex/i)
  })

  it('409 when attachment already applied', async () => {
    const db = makeTerraformDb({ planetRow: { id: PLANET_ROW_ID, attachments: [ATTACHMENT_ID], tiles: { type: 'blue' } } })
    const err = await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Hopestone' } }), db).catch(e => e)
    expect(err.message).toMatch(/already attached/i)
  })

  it('happy path: sets terraform_attached and adds attachment', async () => {
    const db = makeTerraformDb()
    await resolvePromissoryHandler('terraform', makeCtx({ selections: { planet_name: 'Hopestone' } }), db)
    // verify game_player_planets update was called
    const planetCalls = db.from.mock.calls.filter(([t]) => t === 'game_player_planets')
    expect(planetCalls.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 6: Run to confirm terraform tests fail**

```bash
npx vitest run tests/lib/promissoryHandlers.phase45.test.js
```

Expected: FAIL — extended terraform logic not yet implemented.

- [ ] **Step 7: Extend terraform case in promissoryHandlers.ts**

Replace the existing `case 'terraform'` block (~line 189) with:

```ts
case 'terraform': {
  const planetName = (ctx.selections as Record<string, unknown>)?.planet_name as string
  if (!planetName) throw dslError('planet_name is required for terraform')
  if (planetName === 'Mecatol Rex') throw dslError('Cannot attach Terraform to home planet or Mecatol Rex', 409)

  // Load planet row — belongs to the ACTIVATING player (holder plays card on their own planet)
  const { data: planetRow } = await db
    .from('game_player_planets')
    .select('id, attachments, tiles(type)')
    .eq('game_id', ctx.gameId)
    .eq('player_id', ctx.activatingPlayerId)
    .eq('planet_name', planetName)
    .maybeSingle()
  if (!planetRow) throw dslError('Planet not controlled by player', 409)

  const pr = planetRow as { id: string; attachments: string[]; tiles?: { type?: string } | null }
  if (pr.tiles?.type === 'faction') throw dslError('Cannot attach Terraform to home planet or Mecatol Rex', 409)

  // Look up attachment row
  const { data: attachmentRow } = await db
    .from('attachments')
    .select('id')
    .eq('name', 'Terraform')
    .maybeSingle()
  const attachmentId = (attachmentRow as { id: string } | null)?.id
  if (attachmentId && (pr.attachments ?? []).includes(attachmentId)) {
    throw dslError('Already attached', 409)
  }

  // Add attachment to the planet
  if (attachmentId) {
    const { error: attachErr } = await db
      .from('game_player_planets')
      .update({ attachments: [...(pr.attachments ?? []), attachmentId] })
      .eq('id', pr.id)
    if (attachErr) throw new Error(`terraform: attachment update failed: ${attachErr.message}`)
  }

  // Set terraform_attached flag
  const { error: planetError } = await db
    .from('game_player_planets')
    .update({ terraform_attached: true })
    .eq('game_id', ctx.gameId)
    .eq('player_id', ctx.activatingPlayerId)
    .eq('planet_name', planetName)
  if (planetError) throw new Error(`terraform: planet update failed: ${planetError.message}`)

  // Store planet_name in note metadata
  if (ctx.noteInstanceId) {
    await db
      .from('game_player_promissory_notes')
      .update({ metadata: { planet_name: planetName } })
      .eq('id', ctx.noteInstanceId)
  }
  return
}
```

- [ ] **Step 8: Add no-op stubs to promissoryHandlers.ts**

Inside the `switch`, in the Model B group (after `antivirus`), add:

```ts
case 'supportForThrone':
case 'alliance':
case 'tradeAgreement':
  return  // no-op: state/transfer handled by game-confirm-transaction or into_play_area
```

- [ ] **Step 9: Remove the inline Terraform block from game-play-promissory-note**

In `game-play-promissory-note/index.ts`, delete the entire block starting at line ~90:

```ts
// DELETE this entire block:
if (noteRefData?.name === 'Terraform') {
  const planetName = body.planet_name
  // ... through to the closing }
  await db.from('game_player_planets').update({ attachments: newAttachments }).eq('id', (planetRow as Record<string, unknown>).id)
}
```

Also: the `promissory_notes` query selects `purge_on_use, into_play_area` — the `name` field is NOT selected and never was, so the block was unreachable regardless. Leave the select as-is (no `name` needed anymore).

- [ ] **Step 10: Run all tests**

```bash
npx vitest run tests/lib/promissoryHandlers.phase45.test.js tests/functions/game-play-promissory-note.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/game-play-promissory-note/index.ts supabase/functions/_shared/promissoryHandlers.ts tests/lib/promissoryHandlers.phase45.test.js tests/functions/game-play-promissory-note.test.js
git commit -m "refactor(p45): move Terraform attachment to handler; add no-op stubs for supportForThrone, alliance, tradeAgreement"
```

---

## Task 4: admin-import-promissory-notes — re-seed ability_definitions + ability_sources

After each import run, promissory note UUIDs change. This task makes the import also (re-)link ability definitions and sources so the dispatch chain stays intact.

**Files:**
- Modify: `supabase/functions/admin-import-promissory-notes/index.ts`
- Modify: `tests/functions/admin-import-promissory-notes.test.js`

- [ ] **Step 1: Write failing tests**

In `tests/functions/admin-import-promissory-notes.test.js`, extend `mockDb` and add tests:

```js
function mockDb({ deleteError = null, insertError = null, abilityUpsertError = null, abilitySourceDeleteError = null, abilitySourceInsertError = null, noteRows = [] } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'promissory_notes') {
      return {
        delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
        insert: vi.fn().mockResolvedValue({ error: insertError }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: noteRows, error: null }),
        }),
      }
    }
    if (table === 'ability_definitions') {
      return {
        upsert: vi.fn().mockResolvedValue({ error: abilityUpsertError }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: noteRows.map(n => ({ ability_key: `key_${n.id}`, id: `def_${n.id}` })),
            error: null,
          }),
        }),
      }
    }
    if (table === 'ability_sources') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: abilitySourceDeleteError }),
        }),
        insert: vi.fn().mockResolvedValue({ error: abilitySourceInsertError }),
      }
    }
    return {
      delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

it('upserts ability_definitions after import', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const records = [{ name: 'Political Favor' }]
  await handler(makeRequest({ records }))
  const calls = db.from.mock.calls.map(([t]) => t)
  expect(calls).toContain('ability_definitions')
})

it('deletes and re-inserts ability_sources after import', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const records = [{ name: 'Political Favor' }]
  await handler(makeRequest({ records }))
  const calls = db.from.mock.calls.map(([t]) => t)
  expect(calls).toContain('ability_sources')
})

it('returns abilitiesLinked count in response', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const records = [{ name: 'Political Favor' }]
  const res = await handler(makeRequest({ records }))
  const body = await res.json()
  expect(body).toHaveProperty('abilitiesLinked')
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npx vitest run tests/functions/admin-import-promissory-notes.test.js
```

Expected: the three new tests FAIL.

- [ ] **Step 3: Implement the seeding in admin-import-promissory-notes**

Add the static name→handler map and seeding logic after the existing `insert` call. Full replacement of `index.ts`:

```ts
import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const NOTE_HANDLER_MAP: Record<string, string> = {
  'Ceasefire': 'ceasefire',
  'Political Secret': 'politicalSecret',
  'Trade Convoys': 'tradeConvoys',
  'Promise Of Protection': 'promiseOfProtection',
  'Blood Pact': 'bloodPact',
  'Dark Pact': 'darkPact',
  'Stymie': 'stymie',
  'Antivirus': 'antivirus',
  'Gift Of Prescience': 'giftOfPrescience',
  'Trade Agreement': 'tradeAgreement',
  'Alliance': 'alliance',
  'Support For The Throne': 'supportForThrone',
  'Political Favor': 'politicalFavor',
  'Acquisecence': 'acquiescence',
  'Fires Of The Gashlai': 'firesOfTheGashlai',
  'Cybernetic Enhancements': 'cyberneticEnhancements',
  'Military Support': 'militarySupport',
  "Ragh's Call": 'raghsCall',
  'War Funding': 'warFunding',
  'Research Agreement': 'researchAgreement',
  'Greyfire Mutagen': 'greyfireMutagen',
  'The Cavalry': 'theCavalry',
  'Tekklar Legion': 'tekklarLegion',
  'Creuss Iff': 'creussIff',
  'Spy Net': 'spyNet',
  'Strike Wing Ambuscade': 'strikeWingAmbuscade',
  'Crucible': 'crucible',
  'Scepter Of Dominion': 'scepterOfDominion',
  'Black Market Forgery': 'blackMarketForgery',
}

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  try {
    await requireServiceRole(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")
  if (body.records.length === 0) return errorResponse("'records' must not be empty")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('promissory_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const rows = (body.records as Record<string, unknown>[]).map(r => {
    const { returns_to_owner: _rto, ...rest } = r as Record<string, unknown>
    return {
      ...rest,
      expansion: rest.expansion ?? 'base',
      purge_on_use: rest.purge_on_use ?? false,
      into_play_area: rest.into_play_area ?? false,
    }
  })
  const { error: insertError } = await db.from('promissory_notes').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  // ── Re-seed ability_definitions and ability_sources ──────────────────────

  // 1. Upsert ability_definitions for all notes with handlers
  const abilityDefs = Object.values(NOTE_HANDLER_MAP).map(handlerKey => ({
    ability_key: handlerKey,
    ability_name: handlerKey,
    trigger: { type: 'play' },
    handler: handlerKey,
    exhausts_source: false,
    purges_source: false,
  }))
  const { error: upsertError } = await db
    .from('ability_definitions')
    .upsert(abilityDefs, { onConflict: 'ability_key' })
  if (upsertError) return errorResponse(`Ability definitions upsert failed: ${upsertError.message}`, 500)

  // 2. Delete existing ability_sources for promissory_note source_type
  const { error: srcDeleteError } = await db
    .from('ability_sources')
    .delete()
    .eq('source_type', 'promissory_note')
  if (srcDeleteError) return errorResponse(`Ability sources delete failed: ${srcDeleteError.message}`, 500)

  // 3. Re-insert ability_sources: for each note in the map, link to its ability_definition
  const noteNames = Object.keys(NOTE_HANDLER_MAP)
  const { data: insertedNotes } = await db
    .from('promissory_notes')
    .select('id, name')
    .in('name', noteNames)
  const { data: insertedDefs } = await db
    .from('ability_definitions')
    .select('id, ability_key')
    .in('ability_key', Object.values(NOTE_HANDLER_MAP))

  const noteMap = Object.fromEntries((insertedNotes ?? []).map((n: Record<string, string>) => [n.name, n.id]))
  const defMap = Object.fromEntries((insertedDefs ?? []).map((d: Record<string, string>) => [d.ability_key, d.id]))

  const sourcesToInsert = Object.entries(NOTE_HANDLER_MAP)
    .filter(([noteName, handlerKey]) => noteMap[noteName] && defMap[handlerKey])
    .map(([noteName, handlerKey]) => ({
      ability_id: defMap[handlerKey],
      source_type: 'promissory_note',
      source_id: noteMap[noteName],
    }))

  if (sourcesToInsert.length > 0) {
    const { error: srcInsertError } = await db.from('ability_sources').insert(sourcesToInsert)
    if (srcInsertError) return errorResponse(`Ability sources insert failed: ${srcInsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length, abilitiesLinked: sourcesToInsert.length })
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/functions/admin-import-promissory-notes.test.js
```

Expected: PASS — all tests pass including new seeding tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-import-promissory-notes/index.ts tests/functions/admin-import-promissory-notes.test.js
git commit -m "feat(p45): re-seed ability_definitions and ability_sources on promissory note import"
```

---

## Task 5: Add blackMarketForgery handler

**Files:**
- Modify: `supabase/functions/_shared/promissoryHandlers.ts`
- Modify: `tests/lib/promissoryHandlers.phase45.test.js`

- [ ] **Step 1: Write failing tests**

Add to `tests/lib/promissoryHandlers.phase45.test.js`:

```js
// ── blackMarketForgery ───────────────────────────────────────────────────────

describe('blackMarketForgery', () => {
  const FRAG_1 = 'frag-1-uuid'
  const FRAG_2 = 'frag-2-uuid'

  function makeBMFDb({ fragments = [
    { id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
  ], discardError = null } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'game_exploration_decks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: fragments, error: null }),
            update: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: discardError }),
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    applyAbility.mockResolvedValue({ gainedRelicName: 'Shard of the Throne' })
    applyOnGainRelicEffect.mockResolvedValue(undefined)
  })

  it('400 when fragment_ids missing', async () => {
    const db = makeBMFDb()
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: {} }), db).catch(e => e)
    expect(err.status).toBe(400)
  })

  it('400 when fragment_ids length is not 2', async () => {
    const db = makeBMFDb()
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1] } }), db).catch(e => e)
    expect(err.status).toBe(400)
  })

  it('409 when fragment not found', async () => {
    const db = makeBMFDb({ fragments: [{ id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' }] })
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not found/i)
    expect(err.status).toBe(409)
  })

  it('409 when fragment not owned by player', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'held', resolved_by_player_id: 'someone-else', relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not owned/i)
  })

  it('409 when fragment state is not held', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'discarded', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/not in hand/i)
  })

  it('409 when fragments are different types', async () => {
    const db = makeBMFDb({ fragments: [
      { id: FRAG_1, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'cultural' },
      { id: FRAG_2, state: 'held', resolved_by_player_id: HOLDER_ID, relic_fragment_type: 'hazardous' },
    ]})
    const err = await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db).catch(e => e)
    expect(err.message).toMatch(/same type/i)
  })

  it('happy path: discards fragments and gains relic', async () => {
    const db = makeBMFDb()
    await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db)
    expect(applyAbility).toHaveBeenCalledWith([{ op: 'gain_relic' }], expect.anything(), db)
    expect(applyOnGainRelicEffect).toHaveBeenCalledWith('Shard of the Throne', expect.anything(), db)
  })

  it('happy path: does not call applyOnGainRelicEffect when no relic gained', async () => {
    applyAbility.mockResolvedValue({ gainedRelicName: null })
    const db = makeBMFDb()
    await resolvePromissoryHandler('blackMarketForgery', makeCtx({ selections: { fragment_ids: [FRAG_1, FRAG_2] } }), db)
    expect(applyOnGainRelicEffect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npx vitest run tests/lib/promissoryHandlers.phase45.test.js
```

Expected: blackMarketForgery tests FAIL (handler not implemented).

- [ ] **Step 3: Add imports to promissoryHandlers.ts**

At the top of `supabase/functions/_shared/promissoryHandlers.ts`, add:

```ts
import { dslError, applyAbility } from './abilityDsl.ts'
import { applyOnGainRelicEffect } from './relicEffects.ts'
```

(Remove the existing `import { dslError }` line and merge into the single import.)

- [ ] **Step 4: Add blackMarketForgery case to promissoryHandlers.ts**

Before the `default:` case, add:

```ts
case 'blackMarketForgery': {
  const fragmentIds = (ctx.selections as Record<string, unknown>)?.fragment_ids as string[] | undefined
  if (!fragmentIds || !Array.isArray(fragmentIds) || fragmentIds.length !== 2) {
    throw dslError('fragment_ids must be an array of exactly 2 IDs', 400)
  }

  const { data: fragments, error: fragError } = await db
    .from('game_exploration_decks')
    .select('id, state, resolved_by_player_id, relic_fragment_type')
    .eq('game_id', ctx.gameId)
    .in('id', fragmentIds)
  if (fragError) throw new Error(`blackMarketForgery: fragment query failed: ${fragError.message}`)

  const fragList = (fragments ?? []) as Array<{ id: string; state: string; resolved_by_player_id: string | null; relic_fragment_type: string | null }>
  if (fragList.length !== 2) throw dslError('Fragment not found', 409)

  for (const frag of fragList) {
    if (frag.resolved_by_player_id !== ctx.activatingPlayerId) throw dslError('Fragment not owned by player', 409)
    if (frag.state !== 'held') throw dslError('Fragment not in hand', 409)
    if (!frag.relic_fragment_type) throw dslError('Fragment has no type', 409)
  }

  if (fragList[0].relic_fragment_type !== fragList[1].relic_fragment_type) {
    throw dslError('Fragments must be the same type', 409)
  }

  const { error: discardError } = await db
    .from('game_exploration_decks')
    .update({ state: 'discarded', resolved_by_player_id: null })
    .in('id', fragmentIds)
  if (discardError) throw new Error(`blackMarketForgery: discard failed: ${discardError.message}`)

  const { gainedRelicName } = await applyAbility([{ op: 'gain_relic' }], ctx, db) as { gainedRelicName?: string }
  if (gainedRelicName) {
    await applyOnGainRelicEffect(gainedRelicName, ctx, db)
  }
  return
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/lib/promissoryHandlers.phase45.test.js
```

Expected: PASS — all handler tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/promissoryHandlers.ts tests/lib/promissoryHandlers.phase45.test.js
git commit -m "feat(p45): add blackMarketForgery handler and no-op stubs for alliance, supportForThrone, tradeAgreement"
```

---

## Task 6: Update edgeFunctions.js — playPromissoryNote options signature

**Files:**
- Modify: `src/lib/edgeFunctions.js:151-156`
- Create: `tests/lib/edgeFunctions.phase45.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/edgeFunctions.phase45.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { playPromissoryNote } from '../../src/lib/edgeFunctions.js'

beforeEach(() => {
  vi.clearAllMocks()
  supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
})

describe('playPromissoryNote (options)', () => {
  it('sends planet_name when provided in options', async () => {
    await playPromissoryNote('g1', 'n1', { planet_name: 'Mecatol Rex' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-play-promissory-note',
      expect.objectContaining({ body: expect.objectContaining({ planet_name: 'Mecatol Rex' }) })
    )
  })

  it('sends fragment_ids inside selections when provided', async () => {
    await playPromissoryNote('g1', 'n1', { fragment_ids: ['a', 'b'] })
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'game-play-promissory-note',
      expect.objectContaining({ body: expect.objectContaining({ selections: { fragment_ids: ['a', 'b'] } }) })
    )
  })

  it('sends no extra keys when called with no options', async () => {
    await playPromissoryNote('g1', 'n1')
    const { body } = supabase.functions.invoke.mock.calls[0][1]
    expect(body).not.toHaveProperty('planet_name')
    expect(body).not.toHaveProperty('selections')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/lib/edgeFunctions.phase45.test.js
```

Expected: FAIL — current signature uses `planetName` string, not `options`.

- [ ] **Step 3: Update playPromissoryNote in edgeFunctions.js**

Find line ~151:

```js
// OLD:
export const playPromissoryNote = (gameId, noteInstanceId, planetName) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(planetName ? { planet_name: planetName } : {}),
  })
```

Replace with:

```js
// NEW:
export const playPromissoryNote = (gameId, noteInstanceId, options = {}) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(options.planet_name ? { planet_name: options.planet_name } : {}),
    ...(options.fragment_ids?.length ? { selections: { fragment_ids: options.fragment_ids } } : {}),
  })
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/edgeFunctions.phase45.test.js tests/lib/edgeFunctions.phase8.test.js
```

Expected: PASS. (The phase8 test calls `playPromissoryNote` — confirm it doesn't break.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.phase45.test.js
git commit -m "feat(p45): update playPromissoryNote to accept options object"
```

---

## Task 7: Update useGame.js — playTheNote options + myRelicFragments

**Files:**
- Modify: `src/hooks/useGame.js`
- Create: `tests/hooks/useGame.phase45.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/useGame.phase45.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  playPromissoryNote: vi.fn().mockResolvedValue({ ok: true }),
  // add other exports used by useGame so it doesn't error on import
  updateGameSettings: vi.fn(),
  pickFactionColor: vi.fn(),
  setSpeaker: vi.fn(),
  startGame: vi.fn(),
  endTurn: vi.fn(),
  advancePhase: vi.fn(),
  playerPass: vi.fn(),
  researchTechnology: vi.fn(),
  drawActionCard: vi.fn(),
  discardActionCard: vi.fn(),
  scoreObjective: vi.fn(),
  scoreSecretObjective: vi.fn(),
  discardSecretObjective: vi.fn(),
  revealObjective: vi.fn(),
  drawAgenda: vi.fn(),
  castVotes: vi.fn(),
  resolveAgenda: vi.fn(),
  createTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  rejectTransaction: vi.fn(),
  rescindTransaction: vi.fn(),
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
  updateCommandTokens: vi.fn(),
  shuffleDeck: vi.fn(),
}))

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
  },
}))

import { playPromissoryNote } from '../../src/lib/edgeFunctions.js'
import { supabase } from '../../src/lib/supabase.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME_CODE = 'TEST01'
const GAME_ID = 'game-uuid'

describe('useGame phase45 — playTheNote options', () => {
  it('passes options object to playPromissoryNote', async () => {
    // minimal mock: game loads successfully
    supabase.from.mockImplementation((table) => {
      if (table === 'games') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, round: 1 }, error: null }) }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })
    const { result } = renderHook(() => useGame(GAME_CODE))
    await waitFor(() => result.current.game !== null)
    await act(() => result.current.playTheNote('note-1', { planet_name: 'Mecatol Rex' }))
    expect(playPromissoryNote).toHaveBeenCalledWith(GAME_ID, 'note-1', { planet_name: 'Mecatol Rex' })
  })
})
```

- [ ] **Step 2: Run to verify test fails**

```bash
npx vitest run tests/hooks/useGame.phase45.test.js
```

Expected: FAIL — `playTheNote` still passes `planetName` not `options`.

- [ ] **Step 3: Update playTheNote in useGame.js**

Find `function playTheNote` (~line 409):

```js
// OLD:
function playTheNote(noteInstanceId, planetName) {
  return game ? playPromissoryNote(game.id, noteInstanceId, planetName) : Promise.reject(new Error('Game not loaded'))
}
```

Replace with:

```js
// NEW:
function playTheNote(noteInstanceId, options = {}) {
  return game ? playPromissoryNote(game.id, noteInstanceId, options) : Promise.reject(new Error('Game not loaded'))
}
```

- [ ] **Step 4: Add myRelicFragments state to useGame.js**

In the hook body, find where other state variables (like `myNotes`, `myCards`) are declared and add:

```js
const [myRelicFragments, setMyRelicFragments] = useState([])
```

Find the main `useEffect` that loads game state (look for the async function that fetches game + players data). After the block that sets `currentPlayer`, add a call to load relic fragments:

```js
// Load relic fragments for current player
if (playerId) {
  const { data: frags } = await supabase
    .from('game_exploration_decks')
    .select('id, relic_fragment_type')
    .eq('game_id', gameId)
    .eq('resolved_by_player_id', playerId)
    .eq('state', 'held')
    .not('relic_fragment_type', 'is', null)
  setMyRelicFragments(frags ?? [])
}
```

Where `playerId` is the current player's `game_players.id` (not `user_id`). Look at how `myNotes` is loaded to find the right location and variable name.

Add `myRelicFragments` to the return object alongside the other state.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/hooks/useGame.phase45.test.js tests/hooks/useGame.phase8.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGame.js tests/hooks/useGame.phase45.test.js
git commit -m "feat(p45): add myRelicFragments to useGame; update playTheNote to options signature"
```

---

## Task 8: Frontend components — fragment picker for Black Market Forgery

**Files:**
- Modify: `src/components/game/GameScreen.jsx`
- Modify: `src/components/game/PromissoryNotesModal.jsx`
- Modify: `src/components/game/PlayPromissoryNoteModal.jsx`
- Modify: `tests/components/game/GameScreen.test.jsx`
- Modify: `tests/components/game/PromissoryNotesModal.test.jsx` (extend or create)
- Create: `tests/components/game/PlayPromissoryNoteModal.test.jsx` (if not already existing)

- [ ] **Step 1: Write failing tests for PlayPromissoryNoteModal**

Create/extend `tests/components/game/PlayPromissoryNoteModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlayPromissoryNoteModal from '../../../src/components/game/PlayPromissoryNoteModal.jsx'

const BMF_NOTE = { id: 'note-1', name: 'Black Market Forgery', flavor_text: 'Purge 2 relic fragments of same type.' }
const FRAG_1 = { id: 'frag-1', relic_fragment_type: 'cultural' }
const FRAG_2 = { id: 'frag-2', relic_fragment_type: 'cultural' }
const FRAG_3 = { id: 'frag-3', relic_fragment_type: 'hazardous' }

describe('PlayPromissoryNoteModal — Black Market Forgery', () => {
  it('renders fragment picker for Black Market Forgery', () => {
    render(<PlayPromissoryNoteModal note={BMF_NOTE} myRelicFragments={[FRAG_1, FRAG_2]} onPlay={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/choose 2 relic fragments/i)).toBeInTheDocument()
    expect(screen.getByText('cultural')).toBeInTheDocument()
  })

  it('shows error when PLAY clicked with 0 fragments selected', () => {
    const onPlay = vi.fn()
    render(<PlayPromissoryNoteModal note={BMF_NOTE} myRelicFragments={[FRAG_1]} onPlay={onPlay} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('PLAY'))
    expect(screen.getByText(/select exactly 2 fragments/i)).toBeInTheDocument()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('shows error when 2 different-type fragments selected', () => {
    const onPlay = vi.fn()
    render(<PlayPromissoryNoteModal note={BMF_NOTE} myRelicFragments={[FRAG_1, FRAG_3]} onPlay={onPlay} onClose={vi.fn()} />)
    // Select both fragments
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent === 'cultural'))
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent === 'hazardous'))
    fireEvent.click(screen.getByText('PLAY'))
    expect(screen.getByText(/same type/i)).toBeInTheDocument()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('calls onPlay with fragment_ids when 2 same-type fragments selected', async () => {
    const onPlay = vi.fn().mockResolvedValue(undefined)
    render(<PlayPromissoryNoteModal note={BMF_NOTE} myRelicFragments={[FRAG_1, FRAG_2]} onPlay={onPlay} onClose={vi.fn()} />)
    const buttons = screen.getAllByText('cultural')
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(screen.getByText('PLAY'))
    await vi.waitFor(() => {
      expect(onPlay).toHaveBeenCalledWith(BMF_NOTE.id, expect.objectContaining({ fragment_ids: expect.arrayContaining(['frag-1', 'frag-2']) }))
    })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/PlayPromissoryNoteModal.test.jsx
```

Expected: FAIL — fragment picker not yet implemented.

- [ ] **Step 3: Update PlayPromissoryNoteModal.jsx**

Replace the full file:

```jsx
import { useState } from 'react'

const PLAYER_PICKER_NOTES = ['Political Secret', 'Scepter Of Dominion', "Ragh's Call"]
const PLANET_PICKER_NOTES = ['Military Support', 'Terraform', 'Creuss IFF']
const FRAGMENT_PICKER_NOTES = ['Black Market Forgery']

export default function PlayPromissoryNoteModal({ note, players, myPlanets, myRelicFragments, onPlay, onClose }) {
  const [chosenPlayerId, setChosenPlayerId] = useState(null)
  const [chosenDestinationPlanet, setChosenDestinationPlanet] = useState(null)
  const [chosenFragmentIds, setChosenFragmentIds] = useState([])
  const [error, setError] = useState(null)

  if (!note) return null

  const needsPlayer = PLAYER_PICKER_NOTES.includes(note.name)
  const needsPlanet = PLANET_PICKER_NOTES.includes(note.name)
  const needsFragments = FRAGMENT_PICKER_NOTES.includes(note.name)

  function toggleFragment(id) {
    setChosenFragmentIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : prev
    )
  }

  async function handlePlay() {
    setError(null)
    if (needsFragments) {
      if (chosenFragmentIds.length !== 2) { setError('Select exactly 2 fragments'); return }
      const types = chosenFragmentIds.map(id => (myRelicFragments ?? []).find(f => f.id === id)?.relic_fragment_type)
      if (types[0] !== types[1]) { setError('Both fragments must be the same type'); return }
    }
    try {
      await onPlay(note.id, {
        ...(needsPlayer ? { chosenPlayerId } : {}),
        ...(needsPlanet ? { chosenDestinationPlanet } : {}),
        ...(needsFragments ? { fragment_ids: chosenFragmentIds } : {}),
      })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">{note.name}</p>
        <p className="text-muted text-xs">{note.flavor_text}</p>

        {needsPlayer && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a player:</p>
            {(players ?? []).map(p => (
              <button
                key={p.id}
                className={chosenPlayerId === p.id ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlayerId(p.id)}
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}

        {needsPlanet && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a planet:</p>
            {(myPlanets ?? []).map(p => (
              <button
                key={p.planet_name}
                className={chosenDestinationPlanet === p.planet_name ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenDestinationPlanet(p.planet_name)}
              >
                {p.planet_name}
              </button>
            ))}
          </div>
        )}

        {needsFragments && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose 2 relic fragments of the same type:</p>
            {(myRelicFragments ?? []).map(f => (
              <button
                key={f.id}
                className={chosenFragmentIds.includes(f.id) ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => toggleFragment(f.id)}
              >
                {f.relic_fragment_type}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <div className="flex gap-2">
          <button className="btn-primary text-xs" onClick={handlePlay}>PLAY</button>
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run PlayPromissoryNoteModal tests**

```bash
npx vitest run tests/components/game/PlayPromissoryNoteModal.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Update PromissoryNotesModal.jsx**

```jsx
import { useState } from 'react'
import PlayPromissoryNoteModal from './PlayPromissoryNoteModal.jsx'

function resolveText(text, originPlayerId, players) {
  const originPlayer = players?.find(p => p.id === originPlayerId)
  return text?.replace('{{owner}}', originPlayer?.display_name || 'Unknown') || ''
}

export default function PromissoryNotesModal({ notes, players, myPlanets, myRelicFragments, currentPlayerId, onGive, onPlay, onClose }) {
  const [pendingNote, setPendingNote] = useState(null)

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">MY PROMISSORY NOTES</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {!pendingNote && (notes.length === 0 ? (
          <p className="text-dim text-sm font-body">No promissory notes held.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map(n => {
              const ref = n.promissory_notes
              const text = resolveText(ref?.text, n.origin_player_id, players)
              const needsSubModal = ref?.name === 'Terraform' || ref?.name === 'Black Market Forgery'
              return (
                <div key={n.id} className="panel-inset flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-bright text-sm font-body">{ref?.name}</span>
                    <span className="text-dim text-xs font-body">{text}</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => onGive(n)}>
                      GIVE
                    </button>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => needsSubModal ? setPendingNote(n) : onPlay(n.id)}
                    >
                      PLAY
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {pendingNote && (
        <PlayPromissoryNoteModal
          note={pendingNote.promissory_notes}
          players={players}
          myPlanets={myPlanets}
          myRelicFragments={myRelicFragments}
          onPlay={(_noteId, selections) => {
            const options = {}
            if (selections?.chosenDestinationPlanet) options.planet_name = selections.chosenDestinationPlanet
            if (selections?.fragment_ids) options.fragment_ids = selections.fragment_ids
            onPlay(pendingNote.id, options)
            setPendingNote(null)
          }}
          onClose={() => setPendingNote(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Update GameScreen.jsx**

In `GameScreen.jsx`:

1. Destructure `myRelicFragments` from `useGame`:

```js
// Find the useGame destructure line (~58) and add myRelicFragments:
const { ..., playTheNote, myRelicFragments } = useGame(gameCode)
```

2. Update `handlePlayNote`:

```js
const handlePlayNote = async (noteId, options = {}) => {
  try {
    await playTheNote(noteId, options)
  } catch (e) {
    console.error('Play note error:', e)
  }
}
```

3. Pass `myRelicFragments` to `PromissoryNotesModal`:

```jsx
<PromissoryNotesModal
  ...existing props...
  myRelicFragments={myRelicFragments}
  onPlay={handlePlayNote}
  ...
/>
```

- [ ] **Step 7: Update GameScreen test mock**

In `tests/components/game/GameScreen.test.jsx`, find the `useGame` mock and add `myRelicFragments: []`:

```js
// Find the mock object for useGame (line ~112 area) and add:
myRelicFragments: [],
```

- [ ] **Step 8: Run all tests**

```bash
cd ti4-companion-web && npm test
```

Expected: PASS — all existing tests plus new Phase 45 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/game/PlayPromissoryNoteModal.jsx src/components/game/PromissoryNotesModal.jsx src/components/game/GameScreen.jsx tests/components/game/PlayPromissoryNoteModal.test.jsx tests/components/game/GameScreen.test.jsx
git commit -m "feat(p45): add Black Market Forgery fragment picker; wire myRelicFragments through component tree"
```

---

## Final: Update _index.md status and full test run

- [ ] **Step 1: Update spec file statuses in _index.md**

Change all Phase 45 rows from `planned` to `done` in `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`.

- [ ] **Step 2: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "chore: mark phase 45 spec files as done"
```

---

## Deploy checklist

After all tasks complete, deploy the two changed edge functions:

```bash
supabase functions deploy game-play-promissory-note --no-verify-jwt
supabase functions deploy admin-import-promissory-notes --no-verify-jwt
```

Then re-run admin import for promissory notes to rebuild the ability_sources links.
