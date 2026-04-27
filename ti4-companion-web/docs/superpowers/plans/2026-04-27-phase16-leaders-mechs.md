# Phase 16: Leaders & Mechs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement faction leader tracking (agent/commander/hero status, ability resolution, unlock flow) and mech reference data, with full DSL expansion for newly unblocked ops.

**Architecture:** A `leaders` reference table stores faction leader cards; `admin-import-leaders` seeds it and wires abilities into the existing `ability_definitions`/`ability_sources` system. Six previously no-op DSL ops are implemented. Leader exhaustion/purge is added to `game-resolve-ability`; hero unlock gets its own function; status-phase agent readying is added to `game-advance-phase`. The UI renders a LeaderPanel inside MyPanelSection showing all four cards (agent, commander, hero, mech) with correct status and action buttons.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 + Tailwind CSS 3 (UI), Vitest (tests), Supabase JS v2

**Reference:** Design spec at `ti4-companion-web/docs/superpowers/specs/2026-04-27-phase16-leaders-mechs-design.md`; rules at LRR §50–51, §55, §30, §34, §70.

**Run all tests from:** `ti4-companion-web/` — `npm test`

---

### Task 1: Migration 033 — `leaders` table + `units.faction` column

**Files:**
- Create: `supabase/migrations/033_leaders.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/033_leaders.sql
-- ── Leaders reference table ───────────────────────────────────────────────────
-- Faction-specific leader cards (agent, commander, hero). Used by game-unlock-commander
-- and the new game-unlock-hero; each row links to an ability_definitions row via ability_sources.
CREATE TABLE public.leaders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  leader_type     TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction         TEXT NOT NULL,
  text            TEXT,
  unlock_criteria TEXT
);

-- ── Units: faction column ─────────────────────────────────────────────────────
-- Faction-specific units (mechs) carry the owning faction's name.
-- Generic units (carrier, cruiser, etc.) leave this NULL.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS faction TEXT;
```

- [ ] **Step 2: Verify the SQL parses cleanly**

```bash
cd C:\Users\alexa\Documents\Coding\TI4-Companion
cat supabase/migrations/033_leaders.sql
```
Expected: file contents printed, no syntax errors visible.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/033_leaders.sql
git commit -m "feat(db): add leaders reference table and units.faction column (migration 033)"
```

---

### Task 2: Data — add `faction` field to mech entries in `units.json`

**Files:**
- Modify: `supabase/jsons/units.json`

- [ ] **Step 1: Identify all mech entries needing a faction field**

Open `supabase/jsons/units.json`. Every object with `"unit_type": "mech"` needs a `"faction"` key added. Use the ability text to match each mech to its faction (cross-reference ability keywords with `factions.json` ability names). The confirmed mapping is:

| Mech name | Faction |
|-----------|---------|
| Starlancer | The Mahact Gene-Sorcerers |
| Aerie Sentinel | The Argent Flight |
| Mordred | The Nekro Virus |
| Hecatoncheires | The Titans Of Ul |
| Reanimator | The L1Z1X Mindnet |
| Ember Colossus | The Embers Of Muaat |
| Annihilator | The Barony Of Letnev |
| Z-Grav Eidolon (Ground) | The Nomad |
| Z-Grav Eidolon (Space) | The Nomad |
| ZS Thunderbolt M2 | Sardakk N'orr |
| Scavenger Zeta | The Clan Of Saar |
| Shield Paling | The Arborec |
| Moyin's Ashes | The Yin Brotherhood |
| Dunlain Reaper | (see Step 2) |
| Pride Of Kenara | (see Step 2) |
| Reclaimer | (see Step 2) |
| Indomitus | (see Step 2) |
| Blackshade Infiltrator | (see Step 2) |
| Moll Terminus | (see Step 2) |
| Quantum Manipulator | (see Step 2) |
| Watcher | (see Step 2) |
| Valkyrie Exeskeleton | (see Step 2) |

- [ ] **Step 2: Resolve uncertain faction mappings**

For the remaining mechs, search `supabase/jsons/factions.json` for each keyword phrase in the mech ability text:

- Dunlain Reaper (no faction-specific keyword) → likely **The Federation Of Sol** (infantry-heavy ground combat faction) or **The Naalu Collective**; check which faction has a mech starting unit or ground-combat-specific ability
- Pride Of Kenara ("planet card may be traded") → **The Emirates Of Hacan** (trade faction; their "Arbiters" ability enables trading planet cards)
- Reclaimer ("place 1 PDS or 1 space dock after gaining control") → **The Winnu** (structure-focused; their Tekklar Legion gives +1 to combat on controlled planets)
- Indomitus (Space Cannon 6 to adjacent systems) → **The Xxcha Kingdom** (political/space cannon faction)
- Blackshade Infiltrator ("Stall Tactics faction ability") → **The Mentak Coalition** (Stall Tactics is a Mentak ability)
- Moll Terminus ("opponent ground forces cannot Sustain Damage") → **The Universities Of Jol-Nar** (scientific faction; Fragile infantry variant)
- Quantum Manipulator ("Sustain Damage to cancel ship hit") → **The Vuil'raith Cabal** (rift/disruption faction)
- Watcher ("remove to cancel action card") → **The Yssaril Tribes** (action card disruption faction)
- Valkyrie Exeskeleton ("Sustain Damage → produce 1 hit against opponent") → **The Naaz-Rokha Alliance** (mech-focused faction)

Verify each by checking `factions.json` for matching ability names. Adjust the faction string to match exactly how the faction name appears in `leaders.json` (e.g., `"The Emirates Of Hacan"` not `"Hacan"`).

- [ ] **Step 3: Add `faction` field to each mech entry**

For each mech object, add the `"faction"` key. Example diff for one entry:

```json
{
    "name" : "Starlancer",
    "unit_type" : "mech",
    "faction" : "The Mahact Gene-Sorcerers",
    "cost" : 2,
    "combat" : 6,
    "sustain_damage" : true,
    "abilities" : [
        "After a player whose command token is in your fleet pool activates this system, you may spend their token from your fleet pool to end their turn; they gain that token."
    ]
}
```

Apply the same pattern to every mech entry. Non-mech entries stay unchanged.

- [ ] **Step 4: Commit**

```bash
git add supabase/jsons/units.json
git commit -m "feat(data): add faction field to all mech entries in units.json"
```

---

### Task 3: Data — add `ability` field to all leaders in `leaders.json`

**Files:**
- Modify: `supabase/jsons/leaders.json`

- [ ] **Step 1: Understand the `ability` object format**

Each leader entry gets an `"ability"` object:

```json
{
  "handler": "snake_case_leader_name",
  "exhausts_source": true,
  "purges_source": false,
  "trigger": { "event": "PLAYER_ACTION" }
}
```

Rules:
- **Agents**: `exhausts_source: true`, `purges_source: false`
- **Commanders**: `exhausts_source: false`, `purges_source: false`, `trigger: { "event": "PASSIVE" }` — commanders are passive; no player-action trigger
- **Heroes**: `exhausts_source: false`, `purges_source: true`
- **Suffi An (Mentak agent) only**: use `effects` array instead of `handler` (see Step 2)

Handler key naming: take the leader name, lowercase, replace spaces and special characters with underscores. Examples:
- "Jae Mir Kan" → `"jae_mir_kan"`
- "Rin, The Master's Legacy" → `"rin_the_masters_legacy"`
- "I48S" → `"i48s"`

- [ ] **Step 2: Add `ability` field to each of the 34 entries**

Work through `leaders.json` top to bottom and add the `ability` field. The only entry that uses `effects` instead of `handler` is Suffi An:

```json
{
    "name" : "Suffi An",
    "leader_type" : "agent",
    "faction" : "The Mentak Coalition",
    "text" : "After the Pillage faction ability is used against another player:\nYou may exhaust this card; if you do, you and that player each draw 1 action card.",
    "ability" : {
        "effects" : [
            { "op": "draw_action_card" },
            { "op": "target_draw_action_card" }
        ],
        "exhausts_source" : true,
        "purges_source" : false,
        "trigger" : { "event": "PLAYER_ACTION" }
    }
}
```

All other agents use handler:
```json
{
    "name" : "Jae Mir Kan",
    "leader_type" : "agent",
    "faction" : "The Mahact Gene-Sorcerers",
    "text" : "...",
    "ability" : {
        "handler" : "jae_mir_kan",
        "exhausts_source" : true,
        "purges_source" : false,
        "trigger" : { "event": "PLAYER_ACTION" }
    }
}
```

Commander example:
```json
{
    "name" : "Il Na Viroset",
    "leader_type" : "commander",
    "faction" : "The Mahact Gene-Sorcerers",
    "unlock_criteria" : "Have 2 other factions' command tokens in your fleet pool.",
    "text" : "...",
    "ability" : {
        "handler" : "il_na_viroset",
        "exhausts_source" : false,
        "purges_source" : false,
        "trigger" : { "event": "PASSIVE" }
    }
}
```

Hero example:
```json
{
    "name" : "Airo Shir Aur",
    "leader_type" : "hero",
    "faction" : "The Mahact Gene-Sorcerers",
    "unlock_criteria" : "Have 3 scored objectives.",
    "text" : "...",
    "ability" : {
        "handler" : "airo_shir_aur",
        "exhausts_source" : false,
        "purges_source" : true,
        "trigger" : { "event": "PLAYER_ACTION" }
    }
}
```

Apply these patterns to all 34 leader entries. Use `effects` only for Suffi An; all others use `handler`.

- [ ] **Step 3: Commit**

```bash
git add supabase/jsons/leaders.json
git commit -m "feat(data): add ability definitions to all 34 leaders in leaders.json"
```

---

### Task 4: `admin-import-leaders` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-leaders/index.ts`
- Create: `ti4-companion-web/tests/functions/admin-import-leaders.test.js`

- [ ] **Step 1: Write the failing test**

```js
// ti4-companion-web/tests/functions/admin-import-leaders.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { handler } from '../../../supabase/functions/admin-import-leaders/index.ts'

const AGENT = {
  name: 'Jae Mir Kan', leader_type: 'agent', faction: 'The Mahact Gene-Sorcerers',
  text: 'Some text', unlock_criteria: null,
  ability: { handler: 'jae_mir_kan', exhausts_source: true, purges_source: false, trigger: { event: 'PLAYER_ACTION' } }
}
const COMMANDER = {
  name: 'Il Na Viroset', leader_type: 'commander', faction: 'The Mahact Gene-Sorcerers',
  text: 'Some text', unlock_criteria: 'Have 2 tokens',
  ability: { handler: 'il_na_viroset', exhausts_source: false, purges_source: false, trigger: { event: 'PASSIVE' } }
}

function makeRequest(body) {
  return new Request('http://localhost/admin-import-leaders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({ leaderInsertError = null, abilityInsertError = null, sourceInsertError = null } = {}) {
  const sourceDeleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const leaderDeleteMock = vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) })
  const leaderInsertMock = vi.fn().mockResolvedValue({
    data: [{ id: 'leader-1' }, { id: 'leader-2' }], error: leaderInsertError
  })
  const abilityInsertMock = vi.fn().mockResolvedValue({
    data: [{ id: 'ability-1' }, { id: 'ability-2' }], error: abilityInsertError
  })
  const sourceInsertMock = vi.fn().mockResolvedValue({ error: sourceInsertError })

  db.from.mockImplementation((table) => {
    if (table === 'ability_sources') return { delete: sourceDeleteMock }
    if (table === 'leaders') return { delete: leaderDeleteMock, insert: leaderInsertMock }
    if (table === 'ability_definitions') return { insert: abilityInsertMock }
    return {}
  })
  return { leaderInsertMock, abilityInsertMock, sourceInsertMock }
}

describe('admin-import-leaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireServiceRole.mockResolvedValue(undefined)
  })

  it('returns 401 when not service role', async () => {
    requireServiceRole.mockRejectedValue(new AuthError('Forbidden'))
    const res = await handler(makeRequest({ records: [AGENT] }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when records is missing', async () => {
    const res = await handler(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when records is empty', async () => {
    const res = await handler(makeRequest({ records: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a record is missing name', async () => {
    const res = await handler(makeRequest({ records: [{ leader_type: 'agent', faction: 'X', ability: { handler: 'x', exhausts_source: true, purges_source: false, trigger: {} } }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a record is missing faction', async () => {
    const res = await handler(makeRequest({ records: [{ name: 'X', leader_type: 'agent', ability: { handler: 'x', exhausts_source: true, purges_source: false, trigger: {} } }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when a record is missing ability', async () => {
    const res = await handler(makeRequest({ records: [{ name: 'X', leader_type: 'agent', faction: 'Y' }] }))
    expect(res.status).toBe(400)
  })

  it('returns 200 and imports leaders with ability_definitions and ability_sources', async () => {
    const { leaderInsertMock, abilityInsertMock } = mockDb()
    const res = await handler(makeRequest({ records: [AGENT, COMMANDER] }))
    expect(res.status).toBe(200)
    expect(leaderInsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Jae Mir Kan', leader_type: 'agent', faction: 'The Mahact Gene-Sorcerers' })
      ])
    )
    expect(abilityInsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ handler: 'jae_mir_kan', exhausts_source: true, purges_source: false })
      ])
    )
    const body = await res.json()
    expect(body.imported).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ti4-companion-web
npx vitest run tests/functions/admin-import-leaders.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the function**

```ts
// supabase/functions/admin-import-leaders/index.ts
import { requireServiceRole, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

interface LeaderAbility {
  handler?: string
  effects?: unknown[]
  exhausts_source: boolean
  purges_source: boolean
  trigger: unknown
}

interface LeaderRecord {
  name: string
  leader_type: string
  faction: string
  text?: string
  unlock_criteria?: string
  ability: LeaderAbility
}

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string') return `Record ${index}: missing 'name'`
  if (!r.leader_type || typeof r.leader_type !== 'string') return `Record ${index}: missing 'leader_type'`
  if (!r.faction || typeof r.faction !== 'string') return `Record ${index}: missing 'faction'`
  if (!r.ability || typeof r.ability !== 'object') return `Record ${index}: missing 'ability'`
  const ab = r.ability as Record<string, unknown>
  if (ab.handler == null && ab.effects == null) return `Record ${index}: ability must have 'handler' or 'effects'`
  return null
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  try {
    await requireServiceRole(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
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

  const records = body.records as LeaderRecord[]

  // 1. Delete existing ability_sources for leaders, then leaders
  const { error: srcDeleteError } = await db
    .from('ability_sources')
    .delete()
    .eq('source_type', 'leader')
  if (srcDeleteError) return errorResponse(`Delete sources failed: ${srcDeleteError.message}`, 500)

  const { error: leaderDeleteError } = await db
    .from('leaders')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (leaderDeleteError) return errorResponse(`Delete leaders failed: ${leaderDeleteError.message}`, 500)

  // 2. Insert new leaders
  const leaderRows = records.map(r => ({
    name: r.name,
    leader_type: r.leader_type,
    faction: r.faction,
    text: r.text ?? null,
    unlock_criteria: r.unlock_criteria ?? null,
  }))
  const { data: insertedLeaders, error: leaderInsertError } = await db
    .from('leaders')
    .insert(leaderRows)
    .select('id')
  if (leaderInsertError) return errorResponse(`Insert leaders failed: ${leaderInsertError.message}`, 500)

  const leaderIds = (insertedLeaders as { id: string }[]).map(r => r.id)

  // 3. Insert ability_definitions and ability_sources for each leader
  const abilityRows = records.map((r, i) => {
    const ab = r.ability
    return {
      ability_key: `leader_${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      ability_name: r.name,
      trigger: ab.trigger,
      unlock_conditions: null,
      effects: ab.effects ?? null,
      handler: ab.handler ?? null,
      exhausts_source: ab.exhausts_source,
      purges_source: ab.purges_source,
    }
  })

  const { data: insertedAbilities, error: abilityInsertError } = await db
    .from('ability_definitions')
    .insert(abilityRows)
    .select('id')
  if (abilityInsertError) return errorResponse(`Insert abilities failed: ${abilityInsertError.message}`, 500)

  const abilityIds = (insertedAbilities as { id: string }[]).map(r => r.id)

  const sourceRows = leaderIds.map((leaderId, i) => ({
    ability_id: abilityIds[i],
    source_type: 'leader',
    source_id: leaderId,
    faction_name: null,
  }))
  const { error: sourceInsertError } = await db.from('ability_sources').insert(sourceRows)
  if (sourceInsertError) return errorResponse(`Insert sources failed: ${sourceInsertError.message}`, 500)

  return okResponse({ imported: records.length })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/functions/admin-import-leaders.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-import-leaders/index.ts ti4-companion-web/tests/functions/admin-import-leaders.test.js
git commit -m "feat: add admin-import-leaders Edge Function with ability wiring"
```

---

### Task 5: `importSchemas.js` + `AdminDashboard.jsx`

**Files:**
- Modify: `ti4-companion-web/src/lib/importSchemas.js`
- Modify: `ti4-companion-web/src/components/admin/AdminDashboard.jsx`
- Test: `ti4-companion-web/tests/lib/importSchemas.test.js` (existing)

- [ ] **Step 1: Write the failing test**

Open `ti4-companion-web/tests/lib/importSchemas.test.js`. Add at the bottom of the existing `describe` block:

```js
it('has a schema entry for leaders', () => {
  expect(importSchemas['leaders']).toBeDefined()
  expect(importSchemas['leaders'].fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'name' }),
      expect.objectContaining({ name: 'leader_type' }),
      expect.objectContaining({ name: 'faction' }),
      expect.objectContaining({ name: 'ability' }),
    ])
  )
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/lib/importSchemas.test.js
```
Expected: FAIL — `importSchemas['leaders']` is undefined.

- [ ] **Step 3: Add the `leaders` schema entry**

Open `src/lib/importSchemas.js`. Find the last entry in the exported object and add:

```js
leaders: {
  description: 'Faction leader cards (agent, commander, hero). Each record must include an ability object with handler or effects.',
  fields: [
    { name: 'name',            type: 'string',  required: true,  description: 'Leader card name' },
    { name: 'leader_type',     type: 'string',  required: true,  description: '"agent" | "commander" | "hero"' },
    { name: 'faction',         type: 'string',  required: true,  description: 'Faction name (must match factions table)' },
    { name: 'text',            type: 'string',  required: false, description: 'Ability text as printed on card' },
    { name: 'unlock_criteria', type: 'string',  required: false, description: 'Unlock condition text (commanders and heroes)' },
    { name: 'ability',         type: 'object',  required: true,  description: '{ handler?, effects?, exhausts_source, purges_source, trigger }' },
  ],
},
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/importSchemas.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Add `leaders` to `AdminDashboard.jsx`**

Open `src/components/admin/AdminDashboard.jsx`. Find the array of import table slugs (currently 12 entries). Add `'leaders'` to the list.

- [ ] **Step 6: Commit**

```bash
git add src/lib/importSchemas.js src/components/admin/AdminDashboard.jsx
git commit -m "feat: add leaders to admin import UI and importSchemas"
```

---

### Task 6: DSL expansion — 6 new ops in `abilityDsl.ts`

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js` (existing)

- [ ] **Step 1: Write the failing tests**

Add these tests to the existing `describe('interpretEffects', ...)` block in `tests/lib/abilityDsl.test.js`:

```js
// gain_command_tokens
it('gain_command_tokens increments tactic_total', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const { db, updateMock } = makeDb({ player })
  await interpretEffects([{ op: 'gain_command_tokens', amount: 1 }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 } })
})

// convert_commodities
it('convert_commodities converts all commodities to trade goods', async () => {
  const player = { id: 'p1', trade_goods: 1, commodities: 3, vp: 0, technologies: [], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const { db, updateMock } = makeDb({ player })
  await interpretEffects([{ op: 'convert_commodities', amount: 'all' }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ trade_goods: 4, commodities: 0 })
})

it('convert_commodities converts up to amount', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 4, vp: 0, technologies: [], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const { db, updateMock } = makeDb({ player })
  await interpretEffects([{ op: 'convert_commodities', amount: 2 }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ trade_goods: 2, commodities: 2 })
})

// gain_technology
it('gain_technology appends tech name to technologies', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Neural Motivator'], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const { db, updateMock } = makeDb({ player })
  await interpretEffects([{ op: 'gain_technology', tech_name: 'Sarween Tools' }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ technologies: ['Neural Motivator', 'Sarween Tools'] })
})

it('gain_technology does not duplicate if already owned', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Neural Motivator'], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const { db, updateMock } = makeDb({ player })
  await interpretEffects([{ op: 'gain_technology', tech_name: 'Neural Motivator' }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ technologies: ['Neural Motivator'] })
})

// give_trade_goods — needs a target player
it('give_trade_goods transfers TGs from activating player to target', async () => {
  const player = { id: 'p1', trade_goods: 5, commodities: 0, vp: 0, technologies: [], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const targetPlayer = { id: 'p2', trade_goods: 1 }
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const targetSelectMock = vi.fn().mockResolvedValue({ data: targetPlayer, error: null })
  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }),
        update: updateMock,
      }
      return {}
    }),
  }
  await interpretEffects([{ op: 'give_trade_goods', amount: 3 }], { ...CTX, targetPlayerId: 'p2' }, db)
  expect(updateMock).toHaveBeenCalledWith({ trade_goods: 2 }) // activating player loses 3
})

// target_draw_action_card
it('target_draw_action_card draws a card for the target player', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0,
    command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const deckCard = { id: 'card-uuid' }
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }),
        update: updateMock,
      }
      if (table === 'game_action_card_deck') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: deckCard, error: null }) }) })
        })}) }),
        update: updateMock,
      }
      return {}
    }),
  }
  await interpretEffects([{ op: 'target_draw_action_card' }], { ...CTX, targetPlayerId: 'p2' }, db)
  expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ state: 'held', held_by_player_id: 'p2' }))
})

// replenish_commodities
it('replenish_commodities sets commodities to faction max', async () => {
  const player = { id: 'p1', trade_goods: 0, commodities: 1, vp: 0, technologies: [], action_card_count: 0,
    faction: 'The Emirates Of Hacan', command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } }
  const faction = { commodities: 3 }
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }),
        update: updateMock,
      }
      if (table === 'factions') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: faction, error: null }) }) }),
      }
      return {}
    }),
  }
  await interpretEffects([{ op: 'replenish_commodities' }], CTX, db)
  expect(updateMock).toHaveBeenCalledWith({ commodities: 3 })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/lib/abilityDsl.test.js
```
Expected: new tests FAIL with unexpected op or wrong behaviour.

- [ ] **Step 3: Update `abilityDsl.ts`**

Replace the full `abilityDsl.ts` with:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  targetSystemKey?: string
  chosenAmount?: number
  chosenOption?: number
}

type PlayerRow = Record<string, unknown>

export async function interpretEffects(
  effects: unknown[],
  context: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, trade_goods, commodities, vp, technologies, action_card_count, command_tokens, faction')
    .eq('id', context.activatingPlayerId)
    .maybeSingle()

  if (playerError || !player) throw new Error('Failed to load player data')

  for (const rawEffect of effects) {
    await interpretOp(rawEffect as Record<string, unknown>, context, player as PlayerRow, db)
  }
}

async function interpretOp(
  op: Record<string, unknown>,
  context: ResolveContext,
  player: PlayerRow,
  db: SupabaseClient
): Promise<void> {
  switch (op.op) {
    case 'gain_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: (player.trade_goods as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_trade_goods failed: ${error.message}`)
      break
    }
    case 'spend_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: Math.max(0, (player.trade_goods as number) - amount) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_trade_goods failed: ${error.message}`)
      break
    }
    case 'gain_commodities': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ commodities: (player.commodities as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_commodities failed: ${error.message}`)
      break
    }
    case 'gain_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: (player.vp as number) + (op.amount as number) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_vp failed: ${error.message}`)
      break
    }
    case 'lose_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: Math.max(0, (player.vp as number) - (op.amount as number)) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`lose_vp failed: ${error.message}`)
      break
    }
    case 'draw_action_card': {
      await drawActionCard(context.gameId, context.activatingPlayerId, player, db)
      break
    }
    case 'target_draw_action_card': {
      const targetId = context.targetPlayerId ?? context.activatingPlayerId
      // Load target player's action_card_count for the increment
      const { data: targetPlayer, error: tErr } = await db
        .from('game_players')
        .select('action_card_count')
        .eq('id', targetId)
        .maybeSingle()
      if (tErr || !targetPlayer) throw new Error('target_draw_action_card: target player not found')
      await drawActionCard(context.gameId, targetId, targetPlayer as PlayerRow, db)
      break
    }
    case 'give_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const targetId = context.targetPlayerId ?? context.activatingPlayerId
      const give = Math.min(amount, player.trade_goods as number)
      const { error: e1 } = await db
        .from('game_players')
        .update({ trade_goods: (player.trade_goods as number) - give })
        .eq('id', context.activatingPlayerId)
      if (e1) throw new Error(`give_trade_goods (sender) failed: ${e1.message}`)
      if (targetId !== context.activatingPlayerId) {
        const { data: tgt, error: tErr } = await db
          .from('game_players')
          .select('trade_goods')
          .eq('id', targetId)
          .maybeSingle()
        if (tErr || !tgt) throw new Error('give_trade_goods: target player not found')
        const { error: e2 } = await db
          .from('game_players')
          .update({ trade_goods: ((tgt as PlayerRow).trade_goods as number) + give })
          .eq('id', targetId)
        if (e2) throw new Error(`give_trade_goods (receiver) failed: ${e2.message}`)
      }
      break
    }
    case 'gain_command_tokens': {
      const amount = resolveAmount(op.amount as number | string, context)
      const tokens = (player.command_tokens as Record<string, number>) ?? { tactic_total: 0, fleet: 0, strategy: 0 }
      const { error } = await db
        .from('game_players')
        .update({ command_tokens: { ...tokens, tactic_total: tokens.tactic_total + amount } })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_command_tokens failed: ${error.message}`)
      break
    }
    case 'convert_commodities': {
      const commodities = player.commodities as number
      const tradeGoods = player.trade_goods as number
      const toConvert = op.amount === 'all' ? commodities : Math.min(resolveAmount(op.amount as number | string, context), commodities)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: tradeGoods + toConvert, commodities: commodities - toConvert })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`convert_commodities failed: ${error.message}`)
      break
    }
    case 'gain_technology': {
      const techName = op.tech_name as string
      const techs = (player.technologies as string[]) ?? []
      if (!techs.includes(techName)) {
        const { error } = await db
          .from('game_players')
          .update({ technologies: [...techs, techName] })
          .eq('id', context.activatingPlayerId)
        if (error) throw new Error(`gain_technology failed: ${error.message}`)
      }
      break
    }
    case 'replenish_commodities': {
      const faction = player.faction as string
      const { data: factionRow, error: fErr } = await db
        .from('factions')
        .select('commodities')
        .eq('name', faction)
        .maybeSingle()
      if (fErr || !factionRow) throw new Error('replenish_commodities: faction not found')
      const max = (factionRow as Record<string, number>).commodities
      const { error } = await db
        .from('game_players')
        .update({ commodities: max })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`replenish_commodities failed: ${error.message}`)
      break
    }
    case 'exhaust_planets': {
      const targetId = op.target === 'chosen_player'
        ? (context.targetPlayerId ?? context.activatingPlayerId)
        : context.activatingPlayerId
      const { error } = await db
        .from('game_player_planets')
        .update({ exhausted: true })
        .eq('game_id', context.gameId)
        .eq('player_id', targetId)
      if (error) throw new Error(`exhaust_planets failed: ${error.message}`)
      break
    }
    case 'choose_one': {
      const options = op.options as unknown[]
      const chosenIndex = context.chosenOption ?? 0
      const chosenOp = options[chosenIndex]
      if (chosenOp) {
        await interpretOp(chosenOp as Record<string, unknown>, context, player, db)
      }
      break
    }
    // No-op until the relevant game system is implemented
    case 'modify_roll':
    case 'add_die':
    case 'cancel_hit':
    case 'cast_votes':
    case 'prevent_vote':
    case 'draw_secret_objective':
    case 'place_units':
    case 'destroy_units':
    case 'explore_planet':
    case 'ignore_prerequisite':
    case 'take_from_discard':
      break
    default:
      throw new Error(`Unknown op: ${op.op}`)
  }
}

async function drawActionCard(gameId: string, playerId: string, player: PlayerRow, db: SupabaseClient): Promise<void> {
  const { data: topCard, error: deckError } = await db
    .from('game_action_card_deck')
    .select('id')
    .eq('game_id', gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) throw new Error(`draw_action_card: deck query failed: ${deckError.message}`)
  if (!topCard) return
  const { error: updateCardError } = await db
    .from('game_action_card_deck')
    .update({ state: 'held', held_by_player_id: playerId, deck_position: null })
    .eq('id', (topCard as Record<string, string>).id)
  if (updateCardError) throw new Error(`draw_action_card: update failed: ${updateCardError.message}`)
  const { error: updateCountError } = await db
    .from('game_players')
    .update({ action_card_count: ((player.action_card_count as number) ?? 0) + 1 })
    .eq('id', playerId)
  if (updateCountError) throw new Error(`draw_action_card: count update failed: ${updateCountError.message}`)
}

function resolveAmount(amount: number | string, context: ResolveContext): number {
  if (amount === 'chosen_amount') return context.chosenAmount ?? 0
  return amount as number
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all tests pass (including existing ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat: implement 6 new DSL ops (gain_command_tokens, convert_commodities, gain_technology, give_trade_goods, target_draw_action_card, replenish_commodities)"
```

---

### Task 7: `abilityHandlers.ts` — leader handler stubs

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

Leader handler stubs are async no-ops. No tests needed for stubs (they're just registrations — the existing test in `game-resolve-ability.test.js` mocks `getHandler` wholesale).

- [ ] **Step 1: Add all 34 leader handler stubs**

Replace the full `abilityHandlers.ts` with:

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

const handlers: Record<string, HandlerFn> = {
  // ── Mahact Gene-Sorcerers ─────────────────────────────────────────────────
  jae_mir_kan: async () => {},            // Agent: remove active player's CT, use it for secondary — no-op: needs CT mid-action hook
  il_na_viroset: async () => {},          // Commander: activate systems with own CTs — passive, no-op
  airo_shir_aur: async () => {},          // Hero: move all units in system to adjacent — no-op: needs place_units

  // ── Argent Flight ─────────────────────────────────────────────────────────
  trilossa_aun_mirik: async () => {},     // Agent: place ground forces on adjacent planets — no-op: needs place_units
  trrakan_aun_zulok: async () => {},      // Commander: add die to unit ability rolls — passive, no-op: needs add_die
  mirik_aun_sissiri: async () => {},      // Hero: move ships between systems — no-op: needs movement system

  // ── Nekro Virus ───────────────────────────────────────────────────────────
  nekro_malleon: async () => {},          // Agent: chosen player discard/spend → gain 2 TGs — no-op: conditional on opponent action
  nekro_acidos: async () => {},           // Commander: after gaining tech, draw action card — passive, no-op
  unit_dsgn_flayesh: async () => {},      // Hero: destroy units, gain TGs + tech from planet — no-op: needs destroy_units + gain_technology

  // ── Titans Of Ul ──────────────────────────────────────────────────────────
  tellurian: async () => {},              // Agent: cancel a hit — no-op: needs cancel_hit
  tungstantus: async () => {},            // Commander: after production gain 1 TG — passive, no-op
  ul_the_progenitor: async () => {},      // Hero: attach to Elysium — no-op: needs planet attachment (Phase 17)

  // ── Vuil'raith Cabal ──────────────────────────────────────────────────────
  stillness_of_stars: async () => {},     // Agent: convert opponent commodities to TGs + capture unit — no-op: needs capture mechanic
  that_which_molds_flesh: async () => {}, // Commander: 2 units don't count against production — passive, no-op
  it_feeds_on_carrion: async () => {},    // Hero: roll dice, capture units from gravity rifts — no-op: complex

  // ── Embers Of Muaat ───────────────────────────────────────────────────────
  umbat: async () => {},                  // Agent: chosen player produces 2 units near war sun — no-op: needs production
  magmus: async () => {},                 // Commander: after spending strategy CT, gain 1 TG — passive, no-op
  adjudicator_baal: async () => {},       // Hero: destroy all units, replace tile — no-op: needs destroy_units + tile manipulation

  // ── L1Z1X Mindnet ─────────────────────────────────────────────────────────
  i48s: async () => {},                   // Agent: replace infantry with mech — no-op: needs place_units
  _2ram: async () => {},                  // Commander: ignore Planetary Shield during Bombardment — passive, no-op
  the_helmsman: async () => {},           // Hero: move flagship + dreadnoughts — no-op: needs movement

  // ── Naaz-Rokha Alliance ───────────────────────────────────────────────────
  garv_and_gunn: async () => {},          // Agent: allow player to explore a planet — no-op: needs explore_planet
  dart_and_tai: async () => {},           // Commander: after gaining control, explore planet — passive, no-op: needs explore_planet
  hesh_and_prit: async () => {},          // Hero: gain relic + secondary abilities — no-op: complex

  // ── Federation Of Sol ─────────────────────────────────────────────────────
  evelyn_delouis: async () => {},         // Agent: add die to ground force combat roll — no-op: needs add_die
  claire_gibson: async () => {},          // Commander: place infantry at start of ground combat — passive, no-op: needs place_units
  jace_x_4th_air_legion: async () => {}, // Hero: return all CTs from board to reinforcements — no-op: complex

  // ── Clan Of Saar ──────────────────────────────────────────────────────────
  captain_mendosa: async () => {},        // Agent: increase move value of 1 ship — no-op: needs move attribute override
  rowl_sarrig: async () => {},            // Commander: place fighters/infantry at any space dock — passive, no-op
  gurno_aggero: async () => {},           // Hero: destroy infantry and fighters in adjacent system — no-op: needs destroy_units

  // ── Barony Of Letnev ──────────────────────────────────────────────────────
  viscount_unlenn: async () => {},        // Agent: add die to ship combat roll — no-op: needs add_die
  rear_admiral_farran: async () => {},    // Commander: after sustain damage, gain 1 TG — passive, no-op
  darktalon_treilla: async () => {},      // Hero: ignore fleet pool limits for round — no-op: complex

  // ── Universities Of Jol-Nar ───────────────────────────────────────────────
  doctor_sucaban: async () => {},         // Agent: remove infantry to reduce research cost — no-op: needs research hook
  ta_zern: async () => {},               // Commander: reroll dice for unit abilities — passive, no-op: needs add_die
  rin_the_masters_legacy: async () => {}, // Hero: replace technologies — no-op: needs gain_technology + remove

  // ── Yin Brotherhood ───────────────────────────────────────────────────────
  brother_milor: async () => {},          // Agent: place fighters when ship destroyed — no-op: needs place_units
  brother_omar: async () => {},           // Commander: green tech prereq + extra infantry — passive, no-op
  dannel_of_the_tenth: async () => {},    // Hero: ready planets or place infantry — no-op: needs place_units + ready_planet

  // ── Emirates Of Hacan ─────────────────────────────────────────────────────
  carth_of_golden_sands: async () => {}, // Agent: gain 2 commodities or replenish target — no-op: needs choose_one with target replenish
  gila_the_silvertongue: async () => {}, // Commander: spend TGs for extra votes — passive, no-op: needs cast_votes
  harrugh_gefhara: async () => {},        // Hero: reduce unit cost to 0 during production — no-op: needs production hook

  // ── Winnu ─────────────────────────────────────────────────────────────────
  berekar_berekon: async () => {},        // Agent: reduce production cost by 2 — no-op: needs production hook
  rickar_rickani: async () => {},         // Commander: +2 in Mecatol/home/legendary systems — passive, no-op: needs add_die
  mathis_mathinus: async () => {},        // Hero: perform primary of any strategy card — no-op: needs strategy card hook

  // ── Nomad ─────────────────────────────────────────────────────────────────
  artuno_the_betrayer: async () => {},    // Agent: delayed TG gain mechanic — no-op: complex
  field_marshal_mercer: async () => {},   // Agent: relocate ground forces — no-op: needs place_units
  the_thundarian: async () => {},         // Agent: cancel hits after roll dice — no-op: needs cancel_hit
  navarch_feng: async () => {},           // Commander: produce flagship for free — passive, no-op: needs production hook
  ahk_syl_siven: async () => {},          // Hero: flagship ignores CT for round — no-op: complex

  // ── Yssaril Tribes ────────────────────────────────────────────────────────
  ssruu: async () => {},                  // Agent: copy other agents' abilities — no-op: extremely complex
  so_ata: async () => {},                 // Commander: look at opponent cards after activation — passive, no-op
  kyver_blade_and_key: async () => {},    // Hero: force players to show action cards — no-op: complex

  // ── Arborec ───────────────────────────────────────────────────────────────
  letani_ospha: async () => {},           // Agent: replace ship with one costing up to 2 more — no-op: complex
  dirzuga_rophal: async () => {},         // Commander: produce 1 unit when opponent activates — passive, no-op
  letani_miasmiala: async () => {},       // Hero: produce units in any system with ground forces — no-op: needs production

  // ── Naalu Collective ──────────────────────────────────────────────────────
  zeu: async () => {},                    // Agent: look at top of agenda deck — no-op: information reveal
  maban: async () => {},                  // Commander: produce 1 extra fighter — passive, no-op: needs production
  the_oracle: async () => {},             // Hero: force players to give promissory notes — no-op: complex

  // ── Xxcha Kingdom ─────────────────────────────────────────────────────────
  ggrocuto_rinn: async () => {},          // Agent: ready planet, optionally remove infantry — no-op: needs ready_planet
  elder_qanoj: async () => {},            // Commander: +1 vote per planet, bypass vote prevention — passive, no-op: needs cast_votes
  xxekir_grom: async () => {},            // Hero: complex agenda manipulation — no-op: complex

  // ── Mentak Coalition ──────────────────────────────────────────────────────
  suffi_an: async () => {},               // Agent: both players draw action card (DSL handles this — stub kept as fallback)
  s_ula_mentarion: async () => {},        // Commander: force opponent to give promissory note after winning — passive, no-op
  ipswitch_loose_cannon: async () => {},  // Hero: replace destroyed ships — no-op: complex

  // ── Empyrean ──────────────────────────────────────────────────────────────
  acamar: async () => {},                 // Agent: target gains 1 CT when ships move to empty system — no-op: needs trigger hook
  xuange: async () => {},                 // Commander: return CT when opponent moves into system — passive, no-op
  conservator_procyon: async () => {},    // Hero: place frontier tokens + explore — no-op: needs explore_planet

  // ── Sardakk N'orr ─────────────────────────────────────────────────────────
  t_ro: async () => {},                   // Agent: place 2 infantry on planet in active system — no-op: needs place_units
  g_hom_sek_kus: async () => {},          // Commander: commit from adjacent systems — passive, no-op
  sh_val_harbinger: async () => {},       // Hero: skip to Commit Ground Forces — no-op: needs phase hook

  // ── Ghosts Of Creuss ──────────────────────────────────────────────────────
  emissary_taivra: async () => {},        // Agent: wormhole system adjacent to all wormholes — no-op: needs adjacency override
  sai_seravus: async () => {},            // Commander: place fighters when ships move through wormholes — passive, no-op: needs place_units
  riftwalker_meian: async () => {},       // Hero: swap two systems — no-op: needs tile swap
}

export function getHandler(name: string): HandlerFn {
  const fn = handlers[name]
  if (!fn) throw new Error(`No handler registered for: ${name}`)
  return fn
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts
git commit -m "feat: add handler stubs for all 34 faction leaders in abilityHandlers"
```

---

### Task 8: `game-resolve-ability` — leader exhaustion/purge side-effects

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-resolve-ability.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe` block in `tests/functions/game-resolve-ability.test.js`:

```js
describe('leader side-effects', () => {
  const LEADER_ID = 'leader-uuid'

  function mockDbWithLeader({ leaderType = 'agent', exhaustsSource = true, purgesSource = false, leadersJson = { agent: 'unlocked', commander: 'locked', hero: 'locked' } } = {}) {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0, leaders: leadersJson }, error: null }) }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
      if (table === 'ability_definitions') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({
          data: { ...DSL_ABILITY, exhausts_source: exhaustsSource, purges_source: purgesSource, source_type: 'leader' },
          error: null
        }) }) }),
      }
      if (table === 'ability_sources') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src-uuid' }, error: null }) }) }) }),
      }
      if (table === 'leaders') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_ID, leader_type: leaderType }, error: null }) }) }),
      }
      return {}
    })
  }

  it('exhausts agent leader when exhausts_source=true and source_type=leader', async () => {
    mockDbWithLeader({ leaderType: 'agent', exhaustsSource: true })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0, leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' } }, error: null }) }) }) }),
        update: updateMock,
      }
      if (table === 'ability_definitions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, exhausts_source: true, purges_source: false }, error: null }) }) }) }
      if (table === 'ability_sources') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src-uuid' }, error: null }) }) }) }) }
      if (table === 'leaders') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_ID, leader_type: 'agent' }, error: null }) }) }) }
      return {}
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'leader', source_id: LEADER_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'exhausted', commander: 'locked', hero: 'locked' } })
  })

  it('purges hero leader when purges_source=true and source_type=leader', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0, leaders: { agent: 'unlocked', commander: 'locked', hero: 'unlocked' } }, error: null }) }) }) }),
        update: updateMock,
      }
      if (table === 'ability_definitions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, exhausts_source: false, purges_source: true }, error: null }) }) }) }
      if (table === 'ability_sources') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src-uuid' }, error: null }) }) }) }) }
      if (table === 'leaders') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_ID, leader_type: 'hero' }, error: null }) }) }) }
      return {}
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'leader', source_id: LEADER_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'unlocked', commander: 'locked', hero: 'purged' } })
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```
Expected: new `leader side-effects` tests FAIL.

- [ ] **Step 3: Add leader side-effects branch to `game-resolve-ability`**

In `supabase/functions/game-resolve-ability/index.ts`, replace the side-effects block (step 6, after the `try { if (ability.handler) ... } catch` block) with:

```ts
  // 6. Apply source side-effects
  const ab = ability as Record<string, unknown>

  if (ab.source_type === 'leader' || body.source_type === 'leader') {
    // handled below
  }

  if (ab.exhausts_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'exhausted' }).eq('id', body.source_id)
    } else if (body.source_type === 'leader') {
      const { data: leaderRow } = await db.from('leaders').select('leader_type').eq('id', body.source_id).maybeSingle()
      if (leaderRow && (leaderRow as Record<string, string>).leader_type === 'agent') {
        const { data: p } = await db.from('game_players').select('leaders').eq('id', (player as Record<string, string>).id).maybeSingle()
        if (p) {
          const currentLeaders = (p as Record<string, unknown>).leaders as Record<string, string>
          await db.from('game_players').update({ leaders: { ...currentLeaders, agent: 'exhausted' } }).eq('id', (player as Record<string, string>).id)
        }
      }
    }
  }

  if (ab.purges_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'purged' }).eq('id', body.source_id)
    } else if (body.source_type === 'action_card') {
      await db.from('game_action_card_deck').update({ state: 'discarded', held_by_player_id: null }).eq('id', body.source_id)
      const p = player as Record<string, number>
      await db.from('game_players').update({ action_card_count: Math.max(0, p.action_card_count - 1) }).eq('id', p.id)
    } else if (body.source_type === 'leader') {
      const { data: leaderRow } = await db.from('leaders').select('leader_type').eq('id', body.source_id).maybeSingle()
      if (leaderRow && (leaderRow as Record<string, string>).leader_type === 'hero') {
        const { data: p } = await db.from('game_players').select('leaders').eq('id', (player as Record<string, string>).id).maybeSingle()
        if (p) {
          const currentLeaders = (p as Record<string, unknown>).leaders as Record<string, string>
          await db.from('game_players').update({ leaders: { ...currentLeaders, hero: 'purged' } }).eq('id', (player as Record<string, string>).id)
        }
      }
    }
  }
```

Note: the existing block will need refactoring to avoid duplicate branches. Replace the entire side-effects section (lines 79–95 in the original) with the block above.

- [ ] **Step 4: Run all resolve-ability tests**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts ti4-companion-web/tests/functions/game-resolve-ability.test.js
git commit -m "feat: exhaust agent / purge hero in game-resolve-ability when source_type=leader"
```

---

### Task 9: `game-unlock-hero` — new Edge Function

**Files:**
- Create: `supabase/functions/game-unlock-hero/index.ts`
- Create: `ti4-companion-web/tests/functions/game-unlock-hero.test.js`

- [ ] **Step 1: Write the failing test**

```js
// ti4-companion-web/tests/functions/game-unlock-hero.test.js
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

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-unlock-hero/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const LEADER_ID = 'hero-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-unlock-hero', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' } },
  leader = { id: LEADER_ID, leader_type: 'hero' },
  publicObjectives = [{ scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }],
  secretObjectives = [],
  playerUpdateError = null,
} = {}) {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: playerUpdateError }) })
  db.from.mockImplementation((table) => {
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
      update: updateMock,
    }
    if (table === 'leaders') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: leader, error: null }) }) }),
    }
    if (table === 'game_public_objectives') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: publicObjectives, error: null }) }),
    }
    if (table === 'game_player_secret_objectives') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: secretObjectives, error: null }) }) }) }),
    }
    return {}
  })
  return { updateMock }
}

describe('game-unlock-hero', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when leader_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when leader not found', async () => {
    mockDb({ leader: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when leader is not a hero', async () => {
    mockDb({ leader: { id: LEADER_ID, leader_type: 'agent' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when hero is already unlocked', async () => {
    mockDb({ player: { id: PLAYER_ID, leaders: { agent: 'unlocked', commander: 'locked', hero: 'unlocked' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when hero is purged', async () => {
    mockDb({ player: { id: PLAYER_ID, leaders: { agent: 'unlocked', commander: 'locked', hero: 'purged' } } })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when player has fewer than 3 scored objectives', async () => {
    mockDb({ publicObjectives: [{ scored_by: [PLAYER_ID] }, { scored_by: ['other'] }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 and sets hero to unlocked when player has 3 scored objectives', async () => {
    const { updateMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'unlocked', commander: 'locked', hero: 'unlocked' } })
  })

  it('counts secret objectives toward the unlock threshold', async () => {
    const { updateMock } = mockDb({
      publicObjectives: [{ scored_by: [PLAYER_ID] }, { scored_by: ['other'] }],
      secretObjectives: [{ id: 's1' }, { id: 's2' }],
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, leader_id: LEADER_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'unlocked', commander: 'locked', hero: 'unlocked' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/functions/game-unlock-hero.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the function**

```ts
// supabase/functions/game-unlock-hero/index.ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; leader_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.leader_id || typeof body.leader_id !== 'string') return errorResponse("'leader_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, leaders')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: leader, error: leaderError } = await db
    .from('leaders')
    .select('leader_type')
    .eq('id', body.leader_id)
    .maybeSingle()
  if (leaderError) return errorResponse('Database error', 500)
  if (!leader) return errorResponse('Leader not found', 404)
  if ((leader as Record<string, string>).leader_type !== 'hero') {
    return errorResponse('Leader is not a hero', 400)
  }

  const p = player as Record<string, unknown>
  const currentLeaders = (p.leaders as Record<string, string>) ?? {}
  if (currentLeaders.hero !== 'locked') {
    return errorResponse('Hero already unlocked or purged', 409)
  }

  // Count scored objectives: public + secret
  const { data: pubObjs } = await db
    .from('game_public_objectives')
    .select('scored_by')
    .eq('game_id', body.game_id)
  const pubCount = (pubObjs ?? []).filter(
    (o: Record<string, string[]>) => o.scored_by?.includes(p.id as string)
  ).length

  const { data: secObjs } = await db
    .from('game_player_secret_objectives')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', p.id as string)
    .eq('state', 'scored')
  const secCount = (secObjs ?? []).length

  if (pubCount + secCount < 3) {
    return errorResponse('Unlock condition not met: need 3 scored objectives', 409)
  }

  const { error: updateError } = await db
    .from('game_players')
    .update({ leaders: { ...currentLeaders, hero: 'unlocked' } })
    .eq('id', p.id as string)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ unlocked: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/functions/game-unlock-hero.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-unlock-hero/index.ts ti4-companion-web/tests/functions/game-unlock-hero.test.js
git commit -m "feat: add game-unlock-hero Edge Function"
```

---

### Task 10: `game-advance-phase` — ready exhausted agents in status phase

**Files:**
- Modify: `supabase/functions/game-advance-phase/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-advance-phase.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/functions/game-advance-phase.test.js` inside the existing `describe` block:

```js
describe('leader agent readying', () => {
  it('readies exhausted agents for all players when advancing from status phase', async () => {
    const playerUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'games') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: false }, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
          }),
        }),
        update: playerUpdateMock,
      }
      if (table === 'game_player_planets') return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    // Should call update with agent readying via raw SQL or a filter — verify the update was called
    const agentReadyCalls = playerUpdateMock.mock.calls.filter(call =>
      JSON.stringify(call[0])?.includes('unlocked') || JSON.stringify(call[0])?.includes('agent')
    )
    expect(agentReadyCalls.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/functions/game-advance-phase.test.js
```
Expected: the new test FAIL.

- [ ] **Step 3: Add agent readying to `game-advance-phase`**

In `supabase/functions/game-advance-phase/index.ts`, inside the `else if (game.phase === 'status')` block, after resetting `passed`/`strategy_card` but before the phase update, add:

```ts
    // Ready exhausted agents for all players (LRR §51.4)
    const { error: agentReadyError } = await db
      .from('game_players')
      .update({ leaders: db.rpc('jsonb_set_agent_unlocked') as unknown as Record<string, unknown> })
      .eq('game_id', body.game_id)
      .eq('leaders->>agent', 'exhausted')
    // Note: Supabase JS does not support jsonb path updates directly; use raw SQL instead:
```

Actually Supabase JS v2 doesn't support JSONb partial updates via the standard client in a filtered way. The correct approach is to fetch all players with exhausted agents, then update each individually, OR use a raw SQL RPC.

Use the fetch-and-update-each approach (simpler, correct for ≤8 players):

```ts
    // Ready exhausted agents for all players (LRR §51.4 — agents ready during status phase)
    const { data: exhaustedPlayers, error: exhaustedErr } = await db
      .from('game_players')
      .select('id, leaders')
      .eq('game_id', body.game_id)
    if (!exhaustedErr && exhaustedPlayers) {
      for (const p of exhaustedPlayers as { id: string; leaders: Record<string, string> }[]) {
        if (p.leaders?.agent === 'exhausted') {
          await db
            .from('game_players')
            .update({ leaders: { ...p.leaders, agent: 'unlocked' } })
            .eq('id', p.id)
        }
      }
    }
```

Place this block after the `passed`/`strategy_card` reset and before the games table update.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/functions/game-advance-phase.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts ti4-companion-web/tests/functions/game-advance-phase.test.js
git commit -m "feat: ready exhausted leader agents during status phase advance"
```

---

### Task 11: `edgeFunctions.js` — client wrappers for Phase 16

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Modify: `ti4-companion-web/tests/lib/edgeFunctions.phase16.test.js` (new)

- [ ] **Step 1: Write the failing test**

```js
// ti4-companion-web/tests/lib/edgeFunctions.phase16.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } }
}))

import { supabase } from '../../src/lib/supabase.js'
import { unlockHero } from '../../src/lib/edgeFunctions.js'

beforeEach(() => vi.clearAllMocks())

describe('unlockHero', () => {
  it('calls game-unlock-hero with game_id and leader_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { unlocked: true }, error: null })
    await unlockHero('game-1', 'leader-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-unlock-hero', {
      body: { game_id: 'game-1', leader_id: 'leader-1' }
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/lib/edgeFunctions.phase16.test.js
```
Expected: FAIL — `unlockHero` is not exported.

- [ ] **Step 3: Add the new exports to `edgeFunctions.js`**

Open `src/lib/edgeFunctions.js` and append:

```js
export const unlockHero = (gameId, leaderId) =>
  callFunction('game-unlock-hero', { game_id: gameId, leader_id: leaderId })

export const resolveLeaderAbility = (gameId, abilityDefinitionId, leaderId, selections = {}) =>
  callFunction('game-resolve-ability', {
    game_id: gameId,
    ability_definition_id: abilityDefinitionId,
    source_type: 'leader',
    source_id: leaderId,
    selections,
  })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/lib/edgeFunctions.phase16.test.js
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.phase16.test.js
git commit -m "feat: add unlockHero and resolveLeaderAbility client wrappers"
```

---

### Task 12: `useLeaders.js` hook

**Files:**
- Create: `ti4-companion-web/src/hooks/useLeaders.js`
- Create: `ti4-companion-web/tests/hooks/useLeaders.test.js`

- [ ] **Step 1: Write the failing test**

```js
// ti4-companion-web/tests/hooks/useLeaders.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))
vi.mock('../../src/lib/edgeFunctions.js', () => ({
  unlockCommander: vi.fn(),
  unlockHero: vi.fn(),
  resolveAbility: vi.fn(),
  resolveLeaderAbility: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { useLeaders } from '../../src/hooks/useLeaders.js'

const FACTION = 'The Mahact Gene-Sorcerers'
const AGENT = { id: 'l1', name: 'Jae Mir Kan', leader_type: 'agent', faction: FACTION, text: 'Agent text', unlock_criteria: null }
const COMMANDER = { id: 'l2', name: 'Il Na Viroset', leader_type: 'commander', faction: FACTION, text: 'Commander text', unlock_criteria: 'Have 2 tokens' }
const HERO = { id: 'l3', name: 'Airo Shir Aur', leader_type: 'hero', faction: FACTION, text: 'Hero text', unlock_criteria: 'Have 3 scored objectives.' }
const MECH = { id: 'u1', name: 'Starlancer', unit_type: 'mech', faction: FACTION, cost: 2, combat: 6, sustain_damage: true, abilities: ['ability text'] }

function mockSupabase({ leaders = [AGENT, COMMANDER, HERO], mechs = [MECH] } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'leaders') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: leaders, error: null }) }),
    }
    if (table === 'units') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: mechs, error: null }) }) }),
    }
    return {}
  })
}

describe('useLeaders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null leaders and mech when faction is null', () => {
    const { result } = renderHook(() => useLeaders({ currentPlayer: null, gameId: 'g1' }))
    expect(result.current.agent).toBeNull()
    expect(result.current.commander).toBeNull()
    expect(result.current.hero).toBeNull()
    expect(result.current.factionMech).toBeNull()
  })

  it('fetches and returns agent, commander, hero, and mech for the player faction', async () => {
    mockSupabase()
    const currentPlayer = { faction: FACTION, leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' } }
    const { result } = renderHook(() => useLeaders({ currentPlayer, gameId: 'g1' }))
    await waitFor(() => expect(result.current.agent).not.toBeNull())
    expect(result.current.agent.name).toBe('Jae Mir Kan')
    expect(result.current.commander.name).toBe('Il Na Viroset')
    expect(result.current.hero.name).toBe('Airo Shir Aur')
    expect(result.current.factionMech.name).toBe('Starlancer')
  })

  it('exposes leaderStatus from currentPlayer.leaders', async () => {
    mockSupabase()
    const currentPlayer = { faction: FACTION, leaders: { agent: 'exhausted', commander: 'unlocked', hero: 'locked' } }
    const { result } = renderHook(() => useLeaders({ currentPlayer, gameId: 'g1' }))
    await waitFor(() => expect(result.current.agent).not.toBeNull())
    expect(result.current.leaderStatus).toEqual({ agent: 'exhausted', commander: 'unlocked', hero: 'locked' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/hooks/useLeaders.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```js
// ti4-companion-web/src/hooks/useLeaders.js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { unlockCommander, unlockHero, resolveLeaderAbility } from '../lib/edgeFunctions.js'

export function useLeaders({ currentPlayer, gameId }) {
  const [agent, setAgent] = useState(null)
  const [commander, setCommander] = useState(null)
  const [hero, setHero] = useState(null)
  const [factionMech, setFactionMech] = useState(null)

  useEffect(() => {
    if (!currentPlayer?.faction) return

    supabase.from('leaders').select('*').eq('faction', currentPlayer.faction).then(({ data }) => {
      if (!data) return
      setAgent(data.find(l => l.leader_type === 'agent') ?? null)
      setCommander(data.find(l => l.leader_type === 'commander') ?? null)
      setHero(data.find(l => l.leader_type === 'hero') ?? null)
    })

    supabase.from('units').select('*').eq('unit_type', 'mech').eq('faction', currentPlayer.faction).then(({ data }) => {
      setFactionMech(data?.[0] ?? null)
    })
  }, [currentPlayer?.faction])

  const leaderStatus = currentPlayer?.leaders ?? { agent: 'unlocked', commander: 'locked', hero: 'locked' }

  const handleUnlockCommander = async (abilityDefinitionId) => {
    await unlockCommander(gameId, abilityDefinitionId)
  }

  const handleUnlockHero = async (leaderId) => {
    await unlockHero(gameId, leaderId)
  }

  const handleResolveLeaderAbility = async (abilityDefinitionId, leaderId, selections = {}) => {
    await resolveLeaderAbility(gameId, abilityDefinitionId, leaderId, selections)
  }

  return {
    agent,
    commander,
    hero,
    factionMech,
    leaderStatus,
    unlockCommander: handleUnlockCommander,
    unlockHero: handleUnlockHero,
    resolveLeaderAbility: handleResolveLeaderAbility,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/hooks/useLeaders.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLeaders.js ti4-companion-web/tests/hooks/useLeaders.test.js
git commit -m "feat: add useLeaders hook for fetching and managing leader state"
```

---

### Task 13: `LeaderCard.jsx` component

**Files:**
- Create: `ti4-companion-web/src/components/game/LeaderCard.jsx`

No automated tests for pure display components; visual correctness verified manually.

- [ ] **Step 1: Implement `LeaderCard.jsx`**

```jsx
// ti4-companion-web/src/components/game/LeaderCard.jsx
export default function LeaderCard({ leader, status, onUseAbility, onUnlock, isMech = false }) {
  if (!leader) return null

  const statusChip = (s) => {
    const map = {
      unlocked: 'bg-success/20 text-success',
      exhausted: 'bg-muted/20 text-muted',
      locked: 'bg-danger/20 text-danger',
      purged: 'bg-void text-dim line-through',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded font-body uppercase ${map[s] ?? 'text-muted'}`}>
        {s}
      </span>
    )
  }

  const typeBadge = (type) => (
    <span className="label text-xs text-gold">{type?.toUpperCase()}</span>
  )

  const isPurged = status === 'purged'
  const isExhausted = status === 'exhausted'
  const isLocked = status === 'locked'

  return (
    <div className={`panel-inset flex flex-col gap-2 ${isPurged ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <p className="text-bright text-sm font-body font-semibold">{leader.name}</p>
          {!isMech && typeBadge(leader.leader_type)}
        </div>
        {!isMech && statusChip(status)}
      </div>

      <p className="text-dim text-xs font-body whitespace-pre-line">{leader.text}</p>

      {isMech && (
        <div className="flex gap-3 text-xs font-mono text-muted">
          <span>COST {leader.cost}</span>
          <span>COMBAT {leader.combat}</span>
          {leader.sustain_damage && <span className="text-gold">SUSTAIN</span>}
        </div>
      )}

      {!isMech && isLocked && leader.unlock_criteria && (
        <p className="text-warning text-xs font-body">
          Unlock: {leader.unlock_criteria}
        </p>
      )}

      {!isMech && !isPurged && (
        <div className="flex gap-2 mt-1">
          {leader.leader_type === 'agent' && (
            <button
              className={isExhausted ? 'btn-ghost text-xs opacity-40' : 'btn-primary text-xs'}
              disabled={isExhausted}
              onClick={() => !isExhausted && onUseAbility?.(leader)}
            >
              USE ABILITY
            </button>
          )}
          {leader.leader_type === 'commander' && isLocked && (
            <button className="btn-ghost text-xs" onClick={() => onUnlock?.(leader)}>
              CHECK UNLOCK
            </button>
          )}
          {leader.leader_type === 'commander' && !isLocked && (
            <p className="text-muted text-xs font-body italic">Passive — always active</p>
          )}
          {leader.leader_type === 'hero' && isLocked && (
            <button className="btn-ghost text-xs" onClick={() => onUnlock?.(leader)}>
              CHECK UNLOCK
            </button>
          )}
          {leader.leader_type === 'hero' && status === 'unlocked' && (
            <button className="btn-primary text-xs" onClick={() => onUseAbility?.(leader)}>
              USE ABILITY
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/LeaderCard.jsx
git commit -m "feat: add LeaderCard display component"
```

---

### Task 14: `LeaderPanel.jsx` component

**Files:**
- Create: `ti4-companion-web/src/components/game/LeaderPanel.jsx`

- [ ] **Step 1: Implement `LeaderPanel.jsx`**

```jsx
// ti4-companion-web/src/components/game/LeaderPanel.jsx
import LeaderCard from './LeaderCard.jsx'

export default function LeaderPanel({ agent, commander, hero, factionMech, leaderStatus, onUseAbility, onUnlock }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="label text-xs">LEADERS</p>
      <div className="grid grid-cols-2 gap-2">
        <LeaderCard
          leader={agent}
          status={leaderStatus?.agent ?? 'unlocked'}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={commander}
          status={leaderStatus?.commander ?? 'locked'}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={hero}
          status={leaderStatus?.hero ?? 'locked'}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={factionMech}
          status="unlocked"
          isMech
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/LeaderPanel.jsx
git commit -m "feat: add LeaderPanel component rendering all 4 leader cards"
```

---

### Task 15: Wire `LeaderPanel` into `MyPanelSection` and `GameScreen`

**Files:**
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`

- [ ] **Step 1: Add Leaders section to `MyPanelSection.jsx`**

Open `src/components/game/MyPanelSection.jsx`.

Add the new props to the function signature:

```jsx
export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
  onOpenActionCards, onViewTech,
  factionAbilities = [],
  triggerableAbilityIds = new Set(),
  unlockableCommanderAbility = null,
  onPlayAbility,
  onUnlockCommander,
  onOpenSecrets,
  secretCount = 0,
  onOpenNotes, noteCount = 0, onOpenTrade,
  // Phase 16: leaders
  leaderPanel = null,
}) {
```

Then add the `leaderPanel` render at the end of the panel, just before the closing `</div>`:

```jsx
      {/* Leaders */}
      {leaderPanel}
```

- [ ] **Step 2: Wire `useLeaders` and `LeaderPanel` into `GameScreen.jsx`**

Open `src/components/game/GameScreen.jsx`.

Add import at the top:
```jsx
import { useLeaders } from '../../hooks/useLeaders.js'
import LeaderPanel from './LeaderPanel.jsx'
import { unlockHero, resolveLeaderAbility } from '../../lib/edgeFunctions.js'
```

After the `useGame` destructure, add:
```jsx
  const { agent, commander, hero, factionMech, leaderStatus, unlockCommander: doUnlockCommander, unlockHero: doUnlockHero, resolveLeaderAbility: doResolveLeaderAbility } = useLeaders({ currentPlayer, gameId: code })
```

Replace the `leaderIds: []` in `playerSources` with the actual ability source IDs. Add a `useMemo` to compute them from `allAbilityDefinitions`:

```jsx
  const leaderAbilitySources = useMemo(() => {
    if (!currentPlayer?.faction) return []
    return allAbilityDefinitions.filter(a =>
      a.ability_sources?.some(s => s.source_type === 'leader')
    ).flatMap(a =>
      (a.ability_sources ?? []).filter(s => s.source_type === 'leader').map(s => s.source_id)
    )
  }, [allAbilityDefinitions, currentPlayer?.faction])
```

Update `playerSources`:
```jsx
    leaderIds: leaderAbilitySources,
```

Build the `leaderPanelElement` and pass it to `MyPanelSection`:

```jsx
  const leaderPanelElement = (
    <LeaderPanel
      agent={agent}
      commander={commander}
      hero={hero}
      factionMech={factionMech}
      leaderStatus={leaderStatus}
      onUseAbility={(leader) => {
        const ability = allAbilityDefinitions.find(a =>
          a.ability_sources?.some(s => s.source_type === 'leader' && s.source_id === leader.id)
        )
        if (ability) setActivatingAbility({ ability, sourceType: 'leader', sourceId: leader.id })
      }}
      onUnlock={async (leader) => {
        if (leader.leader_type === 'commander') {
          const ability = allAbilityDefinitions.find(a =>
            a.ability_sources?.some(s => s.source_type === 'leader' && s.source_id === leader.id)
          )
          if (ability) await doUnlockCommander(ability.id)
        } else if (leader.leader_type === 'hero') {
          await doUnlockHero(leader.id)
        }
      }}
    />
  )
```

Pass `leaderPanel={leaderPanelElement}` to `<MyPanelSection ... />`.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all existing tests pass; no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/MyPanelSection.jsx src/components/game/GameScreen.jsx
git commit -m "feat: wire LeaderPanel into MyPanelSection and GameScreen"
```

---

### Task 16: Update `_index.md` and `POTENTIAL_TODOS.md`

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`
- Modify: `POTENTIAL_TODOS.md`

- [ ] **Step 1: Add Phase 16 rows to `_index.md`**

Add these rows to the table (after the Phase 15 rows):

```markdown
| [migration-033-leaders](migration-033-leaders.md) | `supabase/migrations/033_leaders.sql` | 16 | Leaders & Mechs | done | — |
| [fn-admin-import-leaders](fn-admin-import-leaders.md) | `supabase/functions/admin-import-leaders/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [shared-abilityDsl-p16](shared-abilityDsl.md) | `supabase/functions/_shared/abilityDsl.ts` | 16 | Leaders & Mechs | done | — |
| [shared-abilityHandlers-p16](shared-abilityHandlers.md) | `supabase/functions/_shared/abilityHandlers.ts` | 16 | Leaders & Mechs | done | — |
| [fn-game-resolve-ability-p16](fn-game-resolve-ability.md) | `supabase/functions/game-resolve-ability/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [fn-game-unlock-hero](fn-game-unlock-hero.md) | `supabase/functions/game-unlock-hero/index.ts` | 16 | Leaders & Mechs | done | migration-033-leaders |
| [fn-game-advance-phase-p16](fn-game-advance-phase.md) | `supabase/functions/game-advance-phase/index.ts` | 16 | Leaders & Mechs | done | — |
| [client-edgeFunctions-p16](client-edgeFunctions.md) | `src/lib/edgeFunctions.js` | 16 | Leaders & Mechs | done | fn-game-unlock-hero |
| [hook-useLeaders](hook-useLeaders.md) | `src/hooks/useLeaders.js` | 16 | Leaders & Mechs | done | client-edgeFunctions-p16 |
| [component-LeaderCard](component-LeaderCard.md) | `src/components/game/LeaderCard.jsx` | 16 | Leaders & Mechs | done | hook-useLeaders |
| [component-LeaderPanel](component-LeaderPanel.md) | `src/components/game/LeaderPanel.jsx` | 16 | Leaders & Mechs | done | component-LeaderCard |
| [component-MyPanelSection-p16](component-MyPanelSection.md) | `src/components/game/MyPanelSection.jsx` | 16 | Leaders & Mechs | done | component-LeaderPanel |
| [component-GameScreen-p16](component-GameScreen.md) | `src/components/game/GameScreen.jsx` | 16 | Leaders & Mechs | done | hook-useLeaders, component-LeaderPanel |
```

- [ ] **Step 2: Add Phase 16 deferred items to `POTENTIAL_TODOS.md`**

Append at the bottom:

```markdown
---

## Leaders & Mechs (Phase 16)

- **Mech component limit enforcement** — `game-produce-units` (Phase 12) must verify that when a player produces a mech, `units.faction` matches their faction and `COUNT(game_player_units WHERE unit_type=mech AND player_id=X) < 2` before placing. Add this guard when implementing Phase 12.
- **Titans of Ul hero (Ul The Progenitor)** — attaches to Elysium rather than being purged; requires planet attachment logic (Phase 17). Handler is currently a no-op stub.
- **Nomad triple-agent** — "The Company" faction ability grants 2 additional agents; `leaders.json` only tracks one agent per faction. Requires schema and import changes to support multiple agents for one faction.
- **Alliance promissory note + commander sharing** — when a player holds an Alliance note the commander ability should be available to them; requires cross-player ability resolution lookup.
- **Leader Deploy abilities** — abilities like "place 1 mech on a planet when X" require the `place_units` DSL op (Phase 19).
- **Passive leader triggers** — commanders that trigger on opponent actions (e.g., Empyrean Xuange) require server-side event hooks not yet designed.
- **`modify_roll` / `add_die` / `cancel_hit` for leaders** — still no-op until the combat hook system is built (Phase 20).
```

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md POTENTIAL_TODOS.md
git commit -m "docs: update _index.md with Phase 16 entries and POTENTIAL_TODOS with deferred leader items"
```

---

### Task 17: Deploy Edge Functions

- [ ] **Step 1: Deploy all new and modified Edge Functions**

```bash
cd C:\Users\alexa\Documents\Coding\TI4-Companion
supabase functions deploy admin-import-leaders --no-verify-jwt
supabase functions deploy game-unlock-hero --no-verify-jwt
supabase functions deploy game-resolve-ability --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
```

- [ ] **Step 2: Apply migration 033 to the remote database**

```bash
supabase db push
```
Or apply manually in the Supabase dashboard SQL editor if `db push` is not configured.

- [ ] **Step 3: Import leaders reference data via the admin UI**

1. Start the dev server: `cd ti4-companion-web && npm run dev`
2. Log in as admin and navigate to `/admin/import/leaders`
3. Paste the contents of `supabase/jsons/leaders.json` and submit
4. Verify: 34 leaders imported, no errors

- [ ] **Step 4: Re-import units to populate the `faction` column**

Navigate to `/admin/import/units`, paste `supabase/jsons/units.json`, and submit. Verify mechs now have faction values in the DB.

- [ ] **Step 5: Run the full test suite one final time**

```bash
cd ti4-companion-web && npm test
```
Expected: all tests pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: Phase 16 Leaders & Mechs complete"
```
