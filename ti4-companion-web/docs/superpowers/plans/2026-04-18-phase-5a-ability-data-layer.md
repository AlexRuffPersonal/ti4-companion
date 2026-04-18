# Phase 5a — Ability Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `ability_definitions` and `ability_sources` reference tables and the admin import pipeline (Edge Functions + UI) that lets the admin populate them.

**Architecture:** Two new PostgreSQL tables hold structured ability data. Two new admin-import Edge Functions accept JSON arrays and upsert rows. `ability_sources` import resolves human-readable names to UUIDs server-side so the importer never has to handle raw UUIDs. Both tables are wired into the existing AdminDashboard and importSchemas.js.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Deno/TypeScript (Edge Functions)

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/023_ability_system.sql` |
| Create | `supabase/functions/admin-import-ability-definitions/index.ts` |
| Create | `supabase/functions/admin-import-ability-sources/index.ts` |
| Modify | `ti4-companion-web/src/lib/importSchemas.js` |
| Modify | `ti4-companion-web/src/components/admin/AdminDashboard.jsx` |

---

## Task 1: Create migration 023

**Files:**
- Create: `supabase/migrations/023_ability_system.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ── Ability Definitions ───────────────────────────────────────────────────────
-- Each row is one distinct ability. Cards that share an ability share a row.
-- UI SYNC: If you change columns, update importSchemas.js ('ability-definitions') and redeploy admin-import-ability-definitions.
CREATE TABLE public.ability_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_key       TEXT NOT NULL UNIQUE,   -- human-readable slug for cross-table linking
  ability_name      TEXT NOT NULL,
  trigger           JSONB NOT NULL,
  unlock_conditions JSONB,                  -- commanders only
  effects           JSONB,                  -- composable DSL ops (mutually exclusive with handler)
  handler           TEXT,                   -- named escape hatch (mutually exclusive with effects)
  exhausts_source   BOOLEAN NOT NULL DEFAULT false,
  purges_source     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT effects_or_handler CHECK (
    (effects IS NOT NULL) != (handler IS NOT NULL)
  )
);

-- ── Ability Sources ───────────────────────────────────────────────────────────
-- M2M: one ability can be shared by many cards; one card can have many abilities.
-- UI SYNC: If you change columns, update importSchemas.js ('ability-sources') and redeploy admin-import-ability-sources.
CREATE TABLE public.ability_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_id   UUID NOT NULL REFERENCES public.ability_definitions(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL CHECK (source_type IN (
    'action_card', 'leader', 'relic', 'faction_ability',
    'promissory_note', 'exploration_card', 'technology'
  )),
  source_id    UUID,        -- null when source_type = 'faction_ability'
  faction_name TEXT         -- set when source_type = 'faction_ability'
);

-- Two partial unique indexes replace a single UNIQUE constraint because
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints, which would
-- allow duplicate faction_ability rows.
CREATE UNIQUE INDEX ability_sources_by_card
  ON public.ability_sources (ability_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX ability_sources_by_faction
  ON public.ability_sources (ability_id, source_type, faction_name)
  WHERE faction_name IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Open Supabase dashboard → SQL Editor, paste and run the SQL above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_ability_system.sql
git commit -m "feat: add migration 023 — ability_definitions and ability_sources tables"
```

---

## Task 2: Create admin-import-ability-definitions Edge Function

**Files:**
- Create: `supabase/functions/admin-import-ability-definitions/index.ts`

- [ ] **Step 1: Create the function**

```typescript
import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.ability_key || typeof r.ability_key !== 'string')
    return `Record ${index}: missing or invalid 'ability_key'`
  if (!r.ability_name || typeof r.ability_name !== 'string')
    return `Record ${index}: missing or invalid 'ability_name'`
  if (!r.trigger || typeof r.trigger !== 'object')
    return `Record ${index}: missing or invalid 'trigger' (must be a JSON object)`
  if (r.effects && r.handler)
    return `Record ${index}: cannot have both 'effects' and 'handler'`
  if (!r.effects && !r.handler)
    return `Record ${index}: must have either 'effects' or 'handler'`
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

  const { error: deleteError } = await db
    .from('ability_definitions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

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

  const { error: insertError } = await db.from('ability_definitions').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: rows.length })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy admin-import-ability-definitions --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-ability-definitions/index.ts
git commit -m "feat: add admin-import-ability-definitions Edge Function"
```

---

## Task 3: Create admin-import-ability-sources Edge Function

**Files:**
- Create: `supabase/functions/admin-import-ability-sources/index.ts`

The importer accepts human-readable names instead of UUIDs. For each record it resolves `ability_key` → `ability_id` and `source_name` → `source_id` server-side. The importer deletes all existing sources before inserting, so re-running a full import is always safe.

- [ ] **Step 1: Create the function**

```typescript
import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const SOURCE_TYPE_TABLE: Record<string, string> = {
  action_card: 'action_cards',
  leader: 'leaders',
  relic: 'relics',
  promissory_note: 'promissory_notes',
  exploration_card: 'exploration_cards',
  technology: 'technologies',
}

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.ability_key || typeof r.ability_key !== 'string')
    return `Record ${index}: missing or invalid 'ability_key'`
  if (!r.source_type || typeof r.source_type !== 'string')
    return `Record ${index}: missing or invalid 'source_type'`
  const validTypes = Object.keys(SOURCE_TYPE_TABLE).concat(['faction_ability'])
  if (!validTypes.includes(r.source_type as string))
    return `Record ${index}: invalid source_type '${r.source_type}'. Must be one of: ${validTypes.join(', ')}`
  if (r.source_type === 'faction_ability') {
    if (!r.faction_name || typeof r.faction_name !== 'string')
      return `Record ${index}: 'faction_name' is required when source_type is 'faction_ability'`
  } else {
    if (!r.source_name || typeof r.source_name !== 'string')
      return `Record ${index}: 'source_name' is required for source_type '${r.source_type}'`
  }
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

  const records = body.records as Record<string, unknown>[]

  // Resolve all ability_keys to UUIDs in one query
  const abilityKeys = [...new Set(records.map(r => r.ability_key as string))]
  const { data: abilityDefs, error: abilityLookupError } = await db
    .from('ability_definitions')
    .select('id, ability_key')
    .in('ability_key', abilityKeys)
  if (abilityLookupError) return errorResponse(`Ability lookup failed: ${abilityLookupError.message}`, 500)

  const abilityKeyToId = Object.fromEntries(
    (abilityDefs ?? []).map((a: Record<string, string>) => [a.ability_key, a.id])
  )

  const missingKey = abilityKeys.find(k => !abilityKeyToId[k])
  if (missingKey) return errorResponse(`ability_key '${missingKey}' not found in ability_definitions`, 400)

  // Resolve source names to UUIDs per source_type
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const abilityId = abilityKeyToId[r.ability_key as string]

    if (r.source_type === 'faction_ability') {
      rows.push({ ability_id: abilityId, source_type: 'faction_ability', source_id: null, faction_name: r.faction_name })
      continue
    }

    const table = SOURCE_TYPE_TABLE[r.source_type as string]
    const { data: sourceRow, error: sourceLookupError } = await db
      .from(table)
      .select('id')
      .eq('name', r.source_name)
      .maybeSingle()
    if (sourceLookupError) return errorResponse(`Source lookup failed: ${sourceLookupError.message}`, 500)
    if (!sourceRow) return errorResponse(`Record ${i + 1}: source_name '${r.source_name}' not found in ${table}`, 400)

    rows.push({ ability_id: abilityId, source_type: r.source_type, source_id: sourceRow.id, faction_name: null })
  }

  const { error: deleteError } = await db
    .from('ability_sources')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('ability_sources').insert(rows)
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: rows.length })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy admin-import-ability-sources --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-ability-sources/index.ts
git commit -m "feat: add admin-import-ability-sources Edge Function"
```

---

## Task 4: Add schemas to importSchemas.js

**Files:**
- Modify: `ti4-companion-web/src/lib/importSchemas.js`

- [ ] **Step 1: Add two new entries at the end of the `importSchemas` object, before the closing `}`**

Add after the last existing entry (secret-objectives):

```javascript
  'ability-definitions': {
    fields: [
      {
        name: 'ability_key',
        required: true,
        type: 'text',
        description: 'Unique slug used to link sources to this ability (e.g. "ancient_burial_sites"). Lowercase with underscores.',
      },
      {
        name: 'ability_name',
        required: true,
        type: 'text',
        description: 'Human-readable ability name (e.g. "Ancient Burial Sites").',
      },
      {
        name: 'trigger',
        required: true,
        type: 'JSONB object',
        description: 'When the ability fires. Required field: event (string). Optional: owner ("self"|"other"|"any"), conditions (array of condition objects). Use event "PASSIVE" for always-on abilities.',
      },
      {
        name: 'unlock_conditions',
        required: false,
        type: 'JSONB array',
        description: 'Commander unlock criteria only. Array of condition objects, each with check (string) and gte (integer). Supported checks: scored_objectives, tech_count, vp_count.',
      },
      {
        name: 'effects',
        required: false,
        type: 'JSONB array',
        description: 'Composable effect ops array. Mutually exclusive with handler. Each op has an "op" field and type-specific fields. See ability system design spec for full op catalogue.',
      },
      {
        name: 'handler',
        required: false,
        type: 'text',
        description: 'Named escape hatch for complex effects not expressible as DSL ops. Mutually exclusive with effects. Must match a registered handler name in abilityHandlers.ts.',
      },
      {
        name: 'exhausts_source',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'If true, the source card is exhausted after this ability resolves.',
      },
      {
        name: 'purges_source',
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'If true, the source card is purged (discarded permanently) after this ability resolves.',
      },
    ],
  },

  'ability-sources': {
    fields: [
      {
        name: 'ability_key',
        required: true,
        type: 'text',
        description: 'The ability_key of the ability_definition this source belongs to.',
      },
      {
        name: 'source_type',
        required: true,
        type: 'text',
        values: ['action_card', 'leader', 'relic', 'faction_ability', 'promissory_note', 'exploration_card', 'technology'],
        description: 'The kind of card or entity granting this ability.',
      },
      {
        name: 'source_name',
        required: false,
        type: 'text',
        description: 'The name of the source card (e.g. "Ancient Burial Sites"). Required for all source_types except faction_ability. Used to look up the source UUID automatically.',
      },
      {
        name: 'faction_name',
        required: false,
        type: 'text',
        description: 'Required when source_type is faction_ability. The canonical faction name (e.g. "The Mentak Coalition").',
      },
    ],
  },
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/src/lib/importSchemas.js
git commit -m "feat: add ability-definitions and ability-sources to importSchemas"
```

---

## Task 5: Update AdminDashboard

**Files:**
- Modify: `ti4-companion-web/src/components/admin/AdminDashboard.jsx`

- [ ] **Step 1: Add a new Abilities group to the GROUPS array**

Add after the `'Objectives'` group entry:

```javascript
  {
    label: 'Abilities',
    tables: [
      { name: 'Ability Definitions', key: 'ability-definitions' },
      { name: 'Ability Sources', key: 'ability-sources' },
    ],
  },
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
cd ti4-companion-web
npx vitest run
```

Expected: all tests pass (count unchanged).

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/src/components/admin/AdminDashboard.jsx
git commit -m "feat: add Ability Definitions and Ability Sources to AdminDashboard"
```
