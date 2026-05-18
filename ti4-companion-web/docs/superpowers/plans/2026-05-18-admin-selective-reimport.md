# Admin Selective Re-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `mode: 'replace' | 'upsert'` parameter to all 15 admin-import edge functions and a radio toggle to `AdminImportPage` so admins can add/update records without replacing the whole table.

**Architecture:** A `mode` field is added to each edge function's request body. `replace` (default) runs the existing delete-then-insert path unchanged; `upsert` calls Supabase's `.upsert(rows, { onConflict: 'id' })` instead. The `AdminImportPage` UI gets a radio toggle that passes the selected mode to `importTable`. Leaders and ability-sources are complex multi-table functions — they accept the `mode` field for API consistency but always run the replace path.

**Tech Stack:** Deno/TypeScript (edge functions), Vitest + @testing-library/react (tests), React 19 + Tailwind CSS (UI)

---

## Files Modified

| File | Change |
|------|--------|
| `ti4-companion-web/src/lib/edgeFunctions.js` | Add `mode` param to `importTable` |
| `ti4-companion-web/tests/lib/edgeFunctions.test.js` | Update `importTable` tests |
| `supabase/functions/admin-import-factions/index.ts` | Add mode branching |
| `supabase/functions/admin-import-tiles/index.ts` | Add mode branching |
| `supabase/functions/admin-import-agendas/index.ts` | Add mode branching |
| `supabase/functions/admin-import-action-cards/index.ts` | Add mode branching |
| `supabase/functions/admin-import-attachments/index.ts` | Add mode branching |
| `supabase/functions/admin-import-exploration-cards/index.ts` | Add mode branching |
| `supabase/functions/admin-import-promissory-notes/index.ts` | Add mode branching |
| `supabase/functions/admin-import-public-objectives/index.ts` | Add mode branching |
| `supabase/functions/admin-import-relics/index.ts` | Add mode branching |
| `supabase/functions/admin-import-secret-objectives/index.ts` | Add mode branching |
| `supabase/functions/admin-import-technologies/index.ts` | Add mode branching |
| `supabase/functions/admin-import-units/index.ts` | Add mode branching |
| `supabase/functions/admin-import-ability-definitions/index.ts` | Add mode branching |
| `supabase/functions/admin-import-leaders/index.ts` | Accept mode param (always replace) |
| `supabase/functions/admin-import-ability-sources/index.ts` | Accept mode param (always replace) |
| `ti4-companion-web/tests/functions/admin-import-factions.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-tiles.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-agendas.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-action-cards.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-attachments.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-exploration-cards.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-promissory-notes.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-public-objectives.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-relics.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-secret-objectives.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-technologies.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-units.test.js` | Add upsert mode tests |
| `ti4-companion-web/tests/functions/admin-import-ability-definitions.test.js` | **Create new** — full test suite |
| `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx` | Add mode toggle tests |
| `ti4-companion-web/src/components/admin/AdminImportPage.jsx` | Add mode radio toggle |

---

## Task 1: `edgeFunctions.js` — add `mode` param to `importTable`

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Modify: `ti4-companion-web/tests/lib/edgeFunctions.test.js`

- [ ] **Step 1: Update the existing `importTable` test to assert `mode` is forwarded**

Open `ti4-companion-web/tests/lib/edgeFunctions.test.js`. Replace the `importTable` describe block (lines 40–59) with:

```js
describe('importTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct edge function with records and default replace mode', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { imported: 3 }, error: null })
    const records = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const result = await importTable('tiles', records)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-import-tiles', {
      body: { records, mode: 'replace' },
    })
    expect(result).toEqual({ imported: 3 })
  })

  it('forwards an explicit mode of upsert', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { imported: 2 }, error: null })
    const records = [{ name: 'A' }]
    await importTable('factions', records, 'upsert')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-import-factions', {
      body: { records, mode: 'upsert' },
    })
  })

  it('throws when the edge function returns an error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Forbidden' } })
    await expect(importTable('factions', [])).rejects.toThrow('Forbidden')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
cd ti4-companion-web
npx vitest run tests/lib/edgeFunctions.test.js
```

Expected: 1–2 failures — `mode` not being sent / wrong call signature.

- [ ] **Step 3: Update `importTable` in `edgeFunctions.js`**

Replace line 31–32:
```js
export const importTable = (table, records) =>
  callFunction(`admin-import-${table}`, { records })
```
With:
```js
export const importTable = (table, records, mode = 'replace') =>
  callFunction(`admin-import-${table}`, { records, mode })
```

- [ ] **Step 4: Run to verify it passes**

```
npx vitest run tests/lib/edgeFunctions.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.test.js
git commit -m "feat: add mode param to importTable (replace|upsert)"
```

---

## Task 2: `admin-import-factions` — reference TDD implementation

**Files:**
- Modify: `supabase/functions/admin-import-factions/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-factions.test.js`

- [ ] **Step 1: Add three failing tests to the factions test file**

Open `ti4-companion-web/tests/functions/admin-import-factions.test.js`.

**a) Update `mockDb` to add `upsert` to the mock:**

Replace the existing `mockDb` function:
```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

**b) Add these three tests inside the `describe('admin-import-factions')` block, after the existing tests:**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Barony of Letnev' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ name: 'Barony of Letnev' })]),
    { onConflict: 'id' }
  )
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Barony of Letnev' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Barony of Letnev' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 2: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-factions.test.js
```

Expected: 3 new tests fail (upsert not implemented yet).

- [ ] **Step 3: Update the factions edge function**

Replace `supabase/functions/admin-import-factions/index.ts` with:

```typescript
import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

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

  let body: { records?: unknown; mode?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")
  if (body.records.length === 0) return errorResponse("'records' must not be empty")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ...r,
    expansion: r.expansion ?? 'base',
    starting_techs: r.starting_techs ?? [],
    abilities: r.abilities ?? [],
  }))

  if (mode === 'replace') {
    // Note: delete and insert are not atomic — if insert fails, the table will be empty until re-imported.
    const { error: deleteError } = await db.from('factions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('factions').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('factions').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 4: Run to verify all factions tests pass**

```
npx vitest run tests/functions/admin-import-factions.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-import-factions/index.ts ti4-companion-web/tests/functions/admin-import-factions.test.js
git commit -m "feat: add upsert mode to admin-import-factions"
```

---

## Task 3: `admin-import-tiles`

**Files:**
- Modify: `supabase/functions/admin-import-tiles/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-tiles.test.js`

Valid record for tiles: `{ tile_number: '001', type: 'mecatol_rex' }`

- [ ] **Step 1: Update `mockDb` in the tiles test file**

Open `ti4-companion-web/tests/functions/admin-import-tiles.test.js`. Replace the `mockDb` function:

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-tiles')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ tile_number: '001', type: 'mecatol_rex' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ tile_number: '001', type: 'mecatol_rex' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ tile_number: '001', type: 'mecatol_rex' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-tiles.test.js
```

- [ ] **Step 4: Update the tiles edge function**

In `supabase/functions/admin-import-tiles/index.ts`:

1. Change the body type declaration from `let body: { records?: unknown }` to:
   ```typescript
   let body: { records?: unknown; mode?: unknown }
   ```

2. Add mode extraction and branching. Replace the block starting with `// Note: delete and insert are not atomic` through the final `return okResponse(...)`:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ...r,
    wormholes: r.wormholes ?? [],
    anomalies: r.anomalies ?? [],
    starts_off_board: r.starts_off_board ?? false,
  }))

  if (mode === 'replace') {
    // Note: delete and insert are not atomic — if insert fails, the table will be empty until re-imported.
    const { error: deleteError } = await db.from('tiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('tiles').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('tiles').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all tiles tests pass**

```
npx vitest run tests/functions/admin-import-tiles.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-tiles/index.ts ti4-companion-web/tests/functions/admin-import-tiles.test.js
git commit -m "feat: add upsert mode to admin-import-tiles"
```

---

## Task 4: `admin-import-agendas`

**Files:**
- Modify: `supabase/functions/admin-import-agendas/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-agendas.test.js`

Valid record: `{ name: 'Holy Planet of Ixth', type: 'law', outcome: 'for_against' }`

- [ ] **Step 1: Update `mockDb` in the agendas test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-agendas')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Holy Planet of Ixth', type: 'law', outcome: 'for_against' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Holy Planet of Ixth', type: 'law', outcome: 'for_against' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Holy Planet of Ixth', type: 'law', outcome: 'for_against' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-agendas.test.js
```

- [ ] **Step 4: Update the agendas edge function**

In `supabase/functions/admin-import-agendas/index.ts`:
1. Change `let body: { records?: unknown }` to `let body: { records?: unknown; mode?: unknown }`
2. Replace the final delete/insert block and `return okResponse` with:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  const rows = (body.records as Record<string, unknown>[]).map(r => ({ ...r }))

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('agendas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('agendas').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('agendas').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

> **Note:** The existing agendas function may already have a `rows` mapping. Keep whatever existing `map()` call is there; just wrap the delete/insert block in the if/else.

- [ ] **Step 5: Run to verify all agendas tests pass**

```
npx vitest run tests/functions/admin-import-agendas.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-agendas/index.ts ti4-companion-web/tests/functions/admin-import-agendas.test.js
git commit -m "feat: add upsert mode to admin-import-agendas"
```

---

## Task 5: `admin-import-action-cards`

**Files:**
- Modify: `supabase/functions/admin-import-action-cards/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-action-cards.test.js`

Valid record: `{ name: 'Counterstroke' }`

- [ ] **Step 1: Update `mockDb` in the action-cards test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-action-cards')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Counterstroke' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Counterstroke' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Counterstroke' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-action-cards.test.js
```

- [ ] **Step 4: Update the action-cards edge function**

In `supabase/functions/admin-import-action-cards/index.ts`:
1. Change `let body: { records?: unknown }` to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching around the existing delete/insert block:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping here
  const rows = (body.records as Record<string, unknown>[]).map(r => ({ ...r }))

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('action_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('action_cards').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('action_cards').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

> **Note:** Check the existing function for the actual table name used in `db.from(...)` — use that exact string.

- [ ] **Step 5: Run to verify all action-cards tests pass**

```
npx vitest run tests/functions/admin-import-action-cards.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-action-cards/index.ts ti4-companion-web/tests/functions/admin-import-action-cards.test.js
git commit -m "feat: add upsert mode to admin-import-action-cards"
```

---

## Task 6: `admin-import-attachments`

**Files:**
- Modify: `supabase/functions/admin-import-attachments/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-attachments.test.js`

Valid record: `{ name: 'Terraform' }`

- [ ] **Step 1: Update `mockDb` in the attachments test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-attachments')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Terraform' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Terraform' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Terraform' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-attachments.test.js
```

- [ ] **Step 4: Update the attachments edge function**

In `supabase/functions/admin-import-attachments/index.ts`:
1. Change `let body: { records?: unknown }` to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  const rows = (body.records as Record<string, unknown>[]).map(r => ({ ...r }))

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('attachments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('attachments').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('attachments').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all attachments tests pass**

```
npx vitest run tests/functions/admin-import-attachments.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-attachments/index.ts ti4-companion-web/tests/functions/admin-import-attachments.test.js
git commit -m "feat: add upsert mode to admin-import-attachments"
```

---

## Task 7: `admin-import-exploration-cards`

**Files:**
- Modify: `supabase/functions/admin-import-exploration-cards/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-exploration-cards.test.js`

Valid record: `{ name: 'Cybernetic Enhancements', deck_type: 'industrial' }`

- [ ] **Step 1: Update `mockDb` in the exploration-cards test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-exploration-cards')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Cybernetic Enhancements', deck_type: 'industrial' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Cybernetic Enhancements', deck_type: 'industrial' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Cybernetic Enhancements', deck_type: 'industrial' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-exploration-cards.test.js
```

- [ ] **Step 4: Update the exploration-cards edge function**

In `supabase/functions/admin-import-exploration-cards/index.ts`:
1. Change `let body: { records?: unknown }` to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching (keep existing `rows` mapping, wrap delete/insert in if/else):

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping here unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('exploration_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('exploration_cards').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('exploration_cards').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all exploration-cards tests pass**

```
npx vitest run tests/functions/admin-import-exploration-cards.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-exploration-cards/index.ts ti4-companion-web/tests/functions/admin-import-exploration-cards.test.js
git commit -m "feat: add upsert mode to admin-import-exploration-cards"
```

---

## Task 8: `admin-import-promissory-notes`

**Files:**
- Modify: `supabase/functions/admin-import-promissory-notes/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-promissory-notes.test.js`

Valid record: `{ name: 'Political Favor' }`

- [ ] **Step 1: Update `mockDb` in the promissory-notes test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-promissory-notes')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Political Favor' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Political Favor' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Political Favor' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-promissory-notes.test.js
```

- [ ] **Step 4: Update the promissory-notes edge function**

In `supabase/functions/admin-import-promissory-notes/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('promissory_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('promissory_notes').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('promissory_notes').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all promissory-notes tests pass**

```
npx vitest run tests/functions/admin-import-promissory-notes.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-promissory-notes/index.ts ti4-companion-web/tests/functions/admin-import-promissory-notes.test.js
git commit -m "feat: add upsert mode to admin-import-promissory-notes"
```

---

## Task 9: `admin-import-public-objectives`

**Files:**
- Modify: `supabase/functions/admin-import-public-objectives/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-public-objectives.test.js`

Valid record: `{ name: 'Spend 3 Influence', stage: 1, condition: 'Spend 3 influence' }`

- [ ] **Step 1: Update `mockDb` in the public-objectives test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-public-objectives')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Spend 3 Influence', stage: 1, condition: 'Spend 3 influence' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Spend 3 Influence', stage: 1, condition: 'Spend 3 influence' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Spend 3 Influence', stage: 1, condition: 'Spend 3 influence' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-public-objectives.test.js
```

- [ ] **Step 4: Update the public-objectives edge function**

In `supabase/functions/admin-import-public-objectives/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('public_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('public_objectives').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('public_objectives').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all public-objectives tests pass**

```
npx vitest run tests/functions/admin-import-public-objectives.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-public-objectives/index.ts ti4-companion-web/tests/functions/admin-import-public-objectives.test.js
git commit -m "feat: add upsert mode to admin-import-public-objectives"
```

---

## Task 10: `admin-import-relics`

**Files:**
- Modify: `supabase/functions/admin-import-relics/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-relics.test.js`

Valid record: `{ name: 'Shard of the Throne' }`

- [ ] **Step 1: Update `mockDb` in the relics test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-relics')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Shard of the Throne' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Shard of the Throne' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Shard of the Throne' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-relics.test.js
```

- [ ] **Step 4: Update the relics edge function**

In `supabase/functions/admin-import-relics/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('relics').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('relics').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('relics').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all relics tests pass**

```
npx vitest run tests/functions/admin-import-relics.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-relics/index.ts ti4-companion-web/tests/functions/admin-import-relics.test.js
git commit -m "feat: add upsert mode to admin-import-relics"
```

---

## Task 11: `admin-import-secret-objectives`

**Files:**
- Modify: `supabase/functions/admin-import-secret-objectives/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-secret-objectives.test.js`

Valid record: `{ name: 'Betray a Friend', condition: 'Have a neighbor spend a favor for you' }`

- [ ] **Step 1: Update `mockDb` in the secret-objectives test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-secret-objectives')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Betray a Friend', condition: 'Have a neighbor spend a favor for you' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Betray a Friend', condition: 'Have a neighbor spend a favor for you' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Betray a Friend', condition: 'Have a neighbor spend a favor for you' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-secret-objectives.test.js
```

- [ ] **Step 4: Update the secret-objectives edge function**

In `supabase/functions/admin-import-secret-objectives/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('secret_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('secret_objectives').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('secret_objectives').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all secret-objectives tests pass**

```
npx vitest run tests/functions/admin-import-secret-objectives.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-secret-objectives/index.ts ti4-companion-web/tests/functions/admin-import-secret-objectives.test.js
git commit -m "feat: add upsert mode to admin-import-secret-objectives"
```

---

## Task 12: `admin-import-technologies`

**Files:**
- Modify: `supabase/functions/admin-import-technologies/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-technologies.test.js`

Valid record: `{ name: 'Neural Motivator', technology_type: 'blue' }`

- [ ] **Step 1: Update `mockDb` in the technologies test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-technologies')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator', technology_type: 'blue' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator', technology_type: 'blue' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'Neural Motivator', technology_type: 'blue' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-technologies.test.js
```

- [ ] **Step 4: Update the technologies edge function**

In `supabase/functions/admin-import-technologies/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('technologies').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('technologies').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('technologies').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all technologies tests pass**

```
npx vitest run tests/functions/admin-import-technologies.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-technologies/index.ts ti4-companion-web/tests/functions/admin-import-technologies.test.js
git commit -m "feat: add upsert mode to admin-import-technologies"
```

---

## Task 13: `admin-import-units`

**Files:**
- Modify: `supabase/functions/admin-import-units/index.ts`
- Modify: `ti4-companion-web/tests/functions/admin-import-units.test.js`

Valid record: `{ name: 'War Sun' }`

- [ ] **Step 1: Update `mockDb` in the units test file**

```js
function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}
```

- [ ] **Step 2: Add three tests inside `describe('admin-import-units')`**

```js
it('calls upsert instead of delete+insert when mode is upsert', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'War Sun' }], mode: 'upsert' }))
  expect(res.status).toBe(200)
  expect(dbMock.delete).not.toHaveBeenCalled()
  expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
})

it('defaults to replace mode when mode field is absent', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn(),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'War Sun' }] }))
  expect(res.status).toBe(200)
  expect(dbMock.upsert).not.toHaveBeenCalled()
  expect(dbMock.delete).toHaveBeenCalled()
})

it('returns 500 when upsert fails', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  const dbMock = {
    delete: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
  }
  db.from.mockReturnValue(dbMock)
  const res = await handler(makeRequest({ records: [{ name: 'War Sun' }], mode: 'upsert' }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/upsert failed/i)
})
```

- [ ] **Step 3: Run to verify new tests fail**

```
npx vitest run tests/functions/admin-import-units.test.js
```

- [ ] **Step 4: Update the units edge function**

In `supabase/functions/admin-import-units/index.ts`:
1. Change body type to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching:

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  // keep existing rows mapping unchanged

  if (mode === 'replace') {
    const { error: deleteError } = await db.from('units').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('units').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('units').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: (body.records as object[]).length })
```

- [ ] **Step 5: Run to verify all units tests pass**

```
npx vitest run tests/functions/admin-import-units.test.js
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-units/index.ts ti4-companion-web/tests/functions/admin-import-units.test.js
git commit -m "feat: add upsert mode to admin-import-units"
```

---

## Task 14: `admin-import-ability-definitions` (new test file)

This function has no existing test file. Create it, then add the mode branching.

**Files:**
- Create: `ti4-companion-web/tests/functions/admin-import-ability-definitions.test.js`
- Modify: `supabase/functions/admin-import-ability-definitions/index.ts`

Valid record: `{ ability_key: 'letnevs_munitions', ability_name: 'Test Ability', trigger: {}, effects: [{}] }`
(Note: `effects` and `handler` are mutually exclusive. Use `effects` only for tests.)

- [ ] **Step 1: Create the full test file**

Create `ti4-companion-web/tests/functions/admin-import-ability-definitions.test.js`:

```js
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireServiceRole: vi.fn(), AuthError }
})

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireServiceRole, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const VALID_RECORD = {
  ability_key: 'letnevs_munitions',
  ability_name: 'Test Ability',
  trigger: {},
  effects: [{}],
}

function makeRequest(body) {
  return new Request('http://localhost/admin-import-ability-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockDb({ deleteError = null, insertError = null, upsertError = null } = {}) {
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: deleteError }) }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn().mockResolvedValue({ error: upsertError }),
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn } }
  await import('../../../supabase/functions/admin-import-ability-definitions/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireServiceRole.mockResolvedValue('user-id')
})

describe('admin-import-ability-definitions', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Missing or invalid Authorization header'))
    const res = await handler(makeRequest({ records: [VALID_RECORD] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when ability_key is missing', async () => {
    const res = await handler(makeRequest({ records: [{ ability_name: 'Test', trigger: {}, effects: [{}] }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/ability_key/)
  })

  it('returns 400 when record has both effects and handler', async () => {
    const res = await handler(makeRequest({ records: [{ ...VALID_RECORD, handler: 'some_handler' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/effects.*handler|handler.*effects/i)
  })

  it('returns 200 with imported count on valid replace', async () => {
    const res = await handler(makeRequest({ records: [VALID_RECORD] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(1)
  })

  it('calls upsert instead of delete+insert when mode is upsert', async () => {
    const dbMock = {
      delete: vi.fn(),
      insert: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    db.from.mockReturnValue(dbMock)
    const res = await handler(makeRequest({ records: [VALID_RECORD], mode: 'upsert' }))
    expect(res.status).toBe(200)
    expect(dbMock.delete).not.toHaveBeenCalled()
    expect(dbMock.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'id' })
  })

  it('defaults to replace mode when mode field is absent', async () => {
    const dbMock = {
      delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn(),
    }
    db.from.mockReturnValue(dbMock)
    const res = await handler(makeRequest({ records: [VALID_RECORD] }))
    expect(res.status).toBe(200)
    expect(dbMock.upsert).not.toHaveBeenCalled()
    expect(dbMock.delete).toHaveBeenCalled()
  })

  it('returns 500 when upsert fails', async () => {
    const dbMock = {
      delete: vi.fn(),
      insert: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } }),
    }
    db.from.mockReturnValue(dbMock)
    const res = await handler(makeRequest({ records: [VALID_RECORD], mode: 'upsert' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/upsert failed/i)
  })
})
```

- [ ] **Step 2: Run to verify the upsert tests fail (auth and validation tests should pass)**

```
npx vitest run tests/functions/admin-import-ability-definitions.test.js
```

Expected: upsert/mode tests fail, others may pass or fail depending on current function state.

- [ ] **Step 3: Update the ability-definitions edge function**

In `supabase/functions/admin-import-ability-definitions/index.ts`:
1. Change `let body: { records?: unknown }` to `let body: { records?: unknown; mode?: unknown }`
2. Add mode branching (replace the delete+insert block at the bottom):

```typescript
  const mode = body.mode === 'upsert' ? 'upsert' : 'replace'
  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ability_key: r.ability_key,
    ability_name: r.ability_name,
    trigger: r.trigger,
    unlock_conditions: r.unlock_conditions ?? null,
    effects: r.effects ?? null,
    handler: r.handler ?? null,
    exhausts_source: r.exhausts_source ?? false,
    purges_source: r.purges_source ?? false,
  }))

  if (mode === 'replace') {
    const { error: deleteError } = await db
      .from('ability_definitions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)
    const { error: insertError } = await db.from('ability_definitions').insert(rows)
    if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)
  } else {
    const { error: upsertError } = await db.from('ability_definitions').upsert(rows, { onConflict: 'id' })
    if (upsertError) return errorResponse(`Upsert failed: ${upsertError.message}`, 500)
  }

  return okResponse({ imported: rows.length })
```

- [ ] **Step 4: Run to verify all ability-definitions tests pass**

```
npx vitest run tests/functions/admin-import-ability-definitions.test.js
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-import-ability-definitions/index.ts ti4-companion-web/tests/functions/admin-import-ability-definitions.test.js
git commit -m "feat: add upsert mode to admin-import-ability-definitions, add test suite"
```

---

## Task 15: `admin-import-leaders` and `admin-import-ability-sources` — accept mode, always replace

These two functions are multi-table with FK resolution; they accept the `mode` field for API consistency but always use the replace path. No `upsert` branch is implemented.

**Files:**
- Modify: `supabase/functions/admin-import-leaders/index.ts`
- Modify: `supabase/functions/admin-import-ability-sources/index.ts`

No new tests needed — existing tests cover the replace path; the mode field is silently ignored.

- [ ] **Step 1: Update leaders to accept `mode` in the body type**

In `supabase/functions/admin-import-leaders/index.ts`, change:
```typescript
let body: { records?: unknown }
```
to:
```typescript
let body: { records?: unknown; mode?: unknown }
```

That's the only change — no branching.

- [ ] **Step 2: Update ability-sources to accept `mode` in the body type**

In `supabase/functions/admin-import-ability-sources/index.ts`, change:
```typescript
let body: { records?: unknown }
```
to:
```typescript
let body: { records?: unknown; mode?: unknown }
```

- [ ] **Step 3: Run all tests to confirm no regressions**

```
npx vitest run tests/functions/admin-import-leaders.test.js
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-import-leaders/index.ts supabase/functions/admin-import-ability-sources/index.ts
git commit -m "feat: accept mode field in leaders and ability-sources (always replace)"
```

---

## Task 16: `AdminImportPage` — mode radio toggle

**Files:**
- Modify: `ti4-companion-web/src/components/admin/AdminImportPage.jsx`
- Modify: `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx`

- [ ] **Step 1: Add failing tests to the AdminImportPage test file**

Open `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx`.

**a) Update the existing `passes the table key and parsed records to importTable` test** to include the default mode:

```js
it('passes the table key, parsed records, and default replace mode to importTable', async () => {
  importTable.mockResolvedValue({ imported: 1 })
  renderPage('factions')
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '[{"name":"Letnev"}]' },
  })
  fireEvent.click(screen.getByRole('button', { name: /import factions/i }))
  await waitFor(() => expect(importTable).toHaveBeenCalledWith('factions', [{ name: 'Letnev' }], 'replace'))
})
```

**b) Add these new tests inside `describe('AdminImportPage')`:**

```js
it('shows Replace All radio as checked by default and shows replace subtitle', () => {
  renderPage()
  expect(screen.getByRole('radio', { name: /replace all/i })).toBeChecked()
  expect(screen.getByText(/replaces all existing/i)).toBeInTheDocument()
})

it('switching to Upsert Only changes subtitle and button label', async () => {
  renderPage()
  fireEvent.click(screen.getByRole('radio', { name: /upsert only/i }))
  await waitFor(() => {
    expect(screen.getByText(/adds new records/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upsert tiles/i })).toBeInTheDocument()
  })
})

it('passes upsert mode to importTable when Upsert Only is selected', async () => {
  importTable.mockResolvedValue({ imported: 1 })
  renderPage('factions')
  fireEvent.click(screen.getByRole('radio', { name: /upsert only/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"Letnev"}]' } })
  fireEvent.click(screen.getByRole('button', { name: /upsert factions/i }))
  await waitFor(() => expect(importTable).toHaveBeenCalledWith('factions', [{ name: 'Letnev' }], 'upsert'))
})

it('shows upsert success message when mode is upsert', async () => {
  importTable.mockResolvedValue({ imported: 3 })
  renderPage()
  fireEvent.click(screen.getByRole('radio', { name: /upsert only/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"x"}]' } })
  fireEvent.click(screen.getByRole('button', { name: /upsert tiles/i }))
  await waitFor(() => expect(screen.getByText(/3 records upserted/i)).toBeInTheDocument())
})

it('shows replace success message when mode is replace', async () => {
  importTable.mockResolvedValue({ imported: 2 })
  renderPage()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"x"}]' } })
  fireEvent.click(screen.getByRole('button', { name: /import tiles/i }))
  await waitFor(() => expect(screen.getByText(/2 records imported.*replaced/i)).toBeInTheDocument())
})
```

- [ ] **Step 2: Run to verify new tests fail**

```
npx vitest run tests/components/admin/AdminImportPage.test.jsx
```

- [ ] **Step 3: Update `AdminImportPage.jsx`**

Replace the entire file with:

```jsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { importTable } from '../../lib/edgeFunctions.js'
import importSchemas from '../../lib/importSchemas.js'
import ImportSchemaPanel from './ImportSchemaPanel.jsx'

const TABLE_LABELS = {
  'tiles':             'Tiles',
  'factions':          'Factions',
  'agendas':           'Agendas',
  'action-cards':      'Action Cards',
  'technologies':      'Technologies',
  'units':             'Units',
  'public-objectives': 'Public Objectives',
  'secret-objectives': 'Secret Objectives',
  'relics':            'Relics',
  'exploration-cards': 'Exploration Cards',
  'attachments':       'Attachments',
  'promissory-notes':  'Promissory Notes',
}

export default function AdminImportPage() {
  const { table } = useParams()
  const [json, setJson]             = useState('')
  const [mode, setMode]             = useState('replace')
  const [status, setStatus]         = useState(null) // null | { type: 'success'|'error', message: string }
  const [submitting, setSubmitting] = useState(false)

  const label = TABLE_LABELS[table] ?? table

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    let records
    try {
      records = JSON.parse(json)
      if (!Array.isArray(records)) throw new Error('Expected a JSON array')
    } catch (err) {
      setStatus({ type: 'error', message: `Invalid JSON: ${err.message}` })
      return
    }

    setSubmitting(true)
    try {
      const { imported } = await importTable(table, records, mode)
      setJson('')
      setStatus({
        type: 'success',
        message: mode === 'replace'
          ? `${imported} records imported. All existing ${label} records replaced.`
          : `${imported} records upserted.`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: `Import failed: ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-void p-8 max-w-2xl">
      <Link to="/admin" className="label text-muted hover:text-text mb-6 inline-block">
        ← Back to Reference Data
      </Link>
      <h1 className="font-display text-bright text-xl tracking-widest mb-2">
        IMPORT {label.toUpperCase()}
      </h1>
      <p className="text-dim text-sm mb-6">
        {mode === 'replace'
          ? `Replaces all existing ${label} records.`
          : `Adds new records and updates existing ones by ID. Does not remove any records.`}
      </p>

      <div className="flex gap-6 mb-6">
        {[['replace', 'Replace All'], ['upsert', 'Upsert Only']].map(([value, text]) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="import-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="accent-plasma"
            />
            <span className="label">{text}</span>
          </label>
        ))}
      </div>

      <ImportSchemaPanel schema={importSchemas[table]} />

      {status && (
        <div
          className={`panel-inset mb-6 text-sm ${
            status.type === 'success' ? 'text-success' : 'text-danger'
          }`}
        >
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          className="input font-mono text-xs h-48 resize-y"
          placeholder={`[{"name": "...", ...}, ...]`}
          value={json}
          onChange={e => setJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? 'Importing...'
              : mode === 'replace'
                ? `Import ${label}`
                : `Upsert ${label}`}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify all AdminImportPage tests pass**

```
npx vitest run tests/components/admin/AdminImportPage.test.jsx
```

- [ ] **Step 5: Run the full test suite to check for regressions**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/components/admin/AdminImportPage.jsx ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx
git commit -m "feat: add Replace All / Upsert Only mode toggle to AdminImportPage"
```

---

## Task 17: Deploy all 15 edge functions

- [ ] **Step 1: Deploy all 15 functions**

Run each deploy from the project root (the `supabase/` directory must be present). Always include `--no-verify-jwt`:

```bash
supabase functions deploy admin-import-factions --no-verify-jwt
supabase functions deploy admin-import-tiles --no-verify-jwt
supabase functions deploy admin-import-agendas --no-verify-jwt
supabase functions deploy admin-import-action-cards --no-verify-jwt
supabase functions deploy admin-import-attachments --no-verify-jwt
supabase functions deploy admin-import-exploration-cards --no-verify-jwt
supabase functions deploy admin-import-promissory-notes --no-verify-jwt
supabase functions deploy admin-import-public-objectives --no-verify-jwt
supabase functions deploy admin-import-relics --no-verify-jwt
supabase functions deploy admin-import-secret-objectives --no-verify-jwt
supabase functions deploy admin-import-technologies --no-verify-jwt
supabase functions deploy admin-import-units --no-verify-jwt
supabase functions deploy admin-import-ability-definitions --no-verify-jwt
supabase functions deploy admin-import-leaders --no-verify-jwt
supabase functions deploy admin-import-ability-sources --no-verify-jwt
```

Expected: each command prints `Deployed successfully`.

- [ ] **Step 2: Smoke test in the admin UI**

Open the admin UI, navigate to any import table (e.g. Factions), confirm:
- "Replace All" and "Upsert Only" radio buttons are visible
- "Replace All" is checked by default
- Subtitle updates when switching modes
- Button label updates when switching modes
- A valid JSON payload imports successfully in both modes

- [ ] **Step 3: Commit final state**

```bash
git add .
git commit -m "chore: deploy admin-import selective reimport feature"
```
