# Phase 39: Mech Unit Card Abilities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add faction mech card text and full DSL ability enforcement by extending the `units` table with `ability_text`, `effects`, and `deploy_trigger` columns; wiring a new `game-deploy-mech` edge function; and surfacing DEPLOY / USE ABILITY buttons on `LeaderCard`.

**Architecture:** Approach A — extend the existing `units` table (no new tables). `game-resolve-ability` gains a `source_type='mech'` branch that reads DSL effects directly from the `units` row. `game-deploy-mech` is a new edge function for Deploy-type abilities. `LeaderPanel` manages the deploy planet-picker modal; `LeaderCard` gains conditional action buttons for mechs.

**Tech Stack:** Supabase PostgreSQL (migration), Deno/TypeScript Edge Functions, React 19 + Vitest 4 + @testing-library/react

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/050_mech_abilities.sql` | Create — 3 new columns on `units` |
| `supabase/functions/admin-import-units/index.ts` | Modify — default `effects: r.effects ?? []` |
| `src/lib/importSchemas.js` | Modify — add `ability_text`, `effects`, `deploy_trigger` to `units` entry |
| `supabase/functions/game-resolve-ability/index.ts` | Modify — add `source_type='mech'` branch; make `ability_definition_id` optional for mech |
| `supabase/functions/game-deploy-mech/index.ts` | Create — Deploy-type mech placement |
| `src/lib/edgeFunctions.js` | Modify — add `deployMech`, `resolveMechAbility` |
| `src/hooks/useLeaders.js` | Modify — expose `deployMech`, `resolveMechAbility` |
| `src/components/game/LeaderCard.jsx` | Modify — DEPLOY / USE ABILITY buttons for `isMech` |
| `src/components/game/LeaderPanel.jsx` | Modify — deploy modal state; new props `planets`, `currentPlayerId`, `onDeployMech`, `onUseMechAbility` |
| `src/components/game/MyPanelSection.jsx` | Modify — thread new `LeaderPanel` props |
| `tests/functions/admin-import-units.test.js` | Modify — add mech-with-ability test |
| `tests/functions/game-resolve-ability.phase39.test.js` | Create — source_type='mech' tests |
| `tests/functions/game-deploy-mech.test.js` | Create — new function tests |
| `tests/hooks/useLeaders.test.js` | Modify — add deployMech / resolveMechAbility tests |
| `tests/components/game/LeaderCard.test.jsx` | Create — mech button render tests |

---

## Task 1: Migration — add ability_text, effects, deploy_trigger to units

**Files:**
- Create: `supabase/migrations/050_mech_abilities.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Phase 39: Mech Unit Card Abilities
-- Adds ability text, DSL effects, and deploy trigger to faction-mech unit rows.
-- Generic unit rows leave all three columns NULL / empty.

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS ability_text   TEXT,
  ADD COLUMN IF NOT EXISTS effects        JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deploy_trigger TEXT;
```

- [ ] **Step 2: Apply the migration and run the test suite to verify no regressions**

```bash
cd ti4-companion-web
npm test
```

Expected: all existing tests pass (new columns are additive).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/050_mech_abilities.sql
git commit -m "feat: migration 050 — add ability_text, effects, deploy_trigger to units"
```

---

## Task 2: Update admin-import-units and importSchemas.js

**Files:**
- Modify: `supabase/functions/admin-import-units/index.ts`
- Modify: `src/lib/importSchemas.js`
- Modify: `tests/functions/admin-import-units.test.js`

- [ ] **Step 1: Write the failing test for mech-with-ability import**

Add this test to `tests/functions/admin-import-units.test.js`:

```javascript
it('imports a mech record with ability_text, effects, and deploy_trigger', async () => {
  requireServiceRole.mockResolvedValue('user-id')
  let insertedRows = null
  db.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ neq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: vi.fn().mockImplementation((rows) => {
      insertedRows = rows
      return Promise.resolve({ error: null })
    }),
  })
  const records = [{
    name: 'Letani Warrior II',
    unit_type: 'mech',
    faction: 'Arborec',
    cost: 2,
    combat: '6(x2)',
    sustain_damage: true,
    planetary_shield: false,
    abilities: ['SUSTAIN DAMAGE'],
    ability_text: 'After you win a ground combat, you may produce 1 infantry in that system.',
    effects: [{ op: 'place_units', unit_type: 'infantry', count: 1 }],
    deploy_trigger: null,
  }]
  const res = await handler(makeRequest({ records }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.imported).toBe(1)
  expect(insertedRows[0].ability_text).toBe('After you win a ground combat, you may produce 1 infantry in that system.')
  expect(insertedRows[0].effects).toEqual([{ op: 'place_units', unit_type: 'infantry', count: 1 }])
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd ti4-companion-web
npx vitest run tests/functions/admin-import-units.test.js
```

Expected: FAIL — `insertedRows[0].ability_text` is undefined (field not yet defaulted).

- [ ] **Step 3: Update `admin-import-units/index.ts` to default the new fields**

Find the `rows` mapping block (around line 37) and add the three new defaults:

```typescript
  const rows = (body.records as Record<string, unknown>[]).map(r => ({
    ...r,
    sustain_damage: r.sustain_damage ?? false,
    planetary_shield: r.planetary_shield ?? false,
    abilities: r.abilities ?? [],
    effects: r.effects ?? [],
    // ability_text and deploy_trigger are nullable — no default needed
  }))
```

- [ ] **Step 4: Add the three new fields to `importSchemas.js`**

Locate the `units` entry in `src/lib/importSchemas.js` (around line 245). After the existing `abilities` field entry (around line 329), add:

```javascript
      {
        name: 'ability_text',
        required: false,
        type: 'text',
        description: 'Faction-specific mech card ability text. Null for generic units.',
      },
      {
        name: 'effects',
        required: false,
        type: 'JSONB array',
        default: '[]',
        description: 'DSL ops array for automated ability enforcement. Same format as ability_definitions.effects. Empty for generic units and passive-only mechs.',
      },
      {
        name: 'deploy_trigger',
        required: false,
        type: 'text',
        values: ['ground_combat_start', 'after_tech_research', 'after_retreat', 'after_produce', 'after_exploration'],
        description: 'Trigger condition for Deploy-type mech abilities. Null for non-deploy mechs and generic units.',
      },
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd ti4-companion-web
npx vitest run tests/functions/admin-import-units.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-import-units/index.ts src/lib/importSchemas.js tests/functions/admin-import-units.test.js
git commit -m "feat: admin-import-units accepts ability_text, effects, deploy_trigger for mechs"
```

---

## Task 3: game-resolve-ability — add source_type='mech' branch

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Create: `tests/functions/game-resolve-ability.phase39.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-resolve-ability.phase39.test.js`:

```javascript
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
vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))
vi.mock('../../../supabase/functions/_shared/gameEvents.ts', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  EVT_RESOLVE_ABILITY: 'resolve_ability',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const UNIT_ID = 'unit-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDbForMech({ playerFaction = 'Arborec', unitFaction = 'Arborec', unitType = 'mech', effects = [] } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: PLAYER_ID, action_card_count: 0, faction: playerFaction },
                error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: UNIT_ID, unit_type: unitType, faction: unitFaction, effects },
              error: null,
            }),
          }),
        }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
  })
}

describe('game-resolve-ability (source_type=mech)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 400 when source_id is missing for mech', async () => {
    mockDbForMech()
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/source_id/)
  })

  it('returns 404 when unit not found', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0, faction: 'Arborec' }, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'units') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when faction does not match', async () => {
    mockDbForMech({ playerFaction: 'Arborec', unitFaction: 'Hacan' })
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction/i)
  })

  it('calls interpretEffects with unit effects and returns resolved:true', async () => {
    const effects = [{ op: 'place_units', unit_type: 'infantry', count: 1 }]
    mockDbForMech({ effects })
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID, selections: { planet_name: 'Mecatol Rex', system_key: '0,0' } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolved).toBe(true)
    expect(interpretEffects).toHaveBeenCalledWith(effects, expect.objectContaining({ activatingPlayerId: PLAYER_ID }), expect.anything())
  })

  it('returns 409 when interpretEffects throws a DSL error', async () => {
    mockDbForMech({ effects: [{ op: 'spend_trade_goods', amount: 5 }] })
    interpretEffects.mockRejectedValueOnce(Object.assign(new Error('Insufficient trade goods'), { status: 409 }))
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'mech', source_id: UNIT_ID }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/insufficient trade goods/i)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-resolve-ability.phase39.test.js
```

Expected: FAIL — `source_type='mech'` is rejected as invalid.

- [ ] **Step 3: Update `game-resolve-ability/index.ts`**

Make the following changes (find each by the comment anchor):

**a) Add `faction` to the player select (line ~33):**

```typescript
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
```

**b) Add `'mech'` to `VALID_SOURCE_TYPES` (line ~24):**

```typescript
  const VALID_SOURCE_TYPES = ['faction_ability', 'action_card', 'leader', 'relic', 'promissory_note', 'exploration_card', 'technology', 'strategy_card', 'mech']
```

**c) Make `ability_definition_id` optional for `source_type='mech'` (replace the existing check at line ~22):**

```typescript
  if (body.source_type !== 'mech') {
    if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string')
      return errorResponse("'ability_definition_id' is required")
  }
```

**d) After the player-not-found check (after `if (!player) return errorResponse(...)`), insert the mech early-return branch:**

```typescript
  // ── Mech ability branch ──────────────────────────────────────────────────
  if (body.source_type === 'mech') {
    if (!body.source_id || typeof body.source_id !== 'string')
      return errorResponse("'source_id' is required for mech abilities")

    const { data: unitRow, error: unitError } = await db
      .from('units')
      .select('effects, faction, unit_type')
      .eq('id', body.source_id)
      .maybeSingle()
    if (unitError) return errorResponse('Database error', 500)
    if (!unitRow) return errorResponse('Mech unit not found', 404)
    if ((unitRow as Record<string, string>).unit_type !== 'mech')
      return errorResponse('source_id must reference a mech unit', 409)
    if ((unitRow as Record<string, string>).faction !== (player as Record<string, string>).faction)
      return errorResponse('Faction mismatch: this mech does not belong to your faction', 409)

    const mechSelections = ((body.selections ?? {}) as Record<string, unknown>)
    const mechContext: ResolveContext = {
      gameId: body.game_id,
      activatingPlayerId: (player as Record<string, string>).id,
      selections: mechSelections,
    }

    try {
      await interpretEffects(
        ((unitRow as Record<string, unknown>).effects as unknown[]) ?? [],
        mechContext,
        db
      )
    } catch (e: unknown) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
    }

    await logEvent(db, {
      game_id: body.game_id,
      player_id: (player as Record<string, string>).id,
      event_type: EVT_RESOLVE_ABILITY,
      payload: { source_type: 'mech', source_id: body.source_id, selections: body.selections },
      round: 0,
      phase: 'action',
    })
    return okResponse({ resolved: true })
  }
  // ── End mech branch ──────────────────────────────────────────────────────
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-resolve-ability.phase39.test.js
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts tests/functions/game-resolve-ability.phase39.test.js
git commit -m "feat: game-resolve-ability supports source_type='mech'"
```

---

## Task 4: New game-deploy-mech edge function

**Files:**
- Create: `supabase/functions/game-deploy-mech/index.ts`
- Create: `tests/functions/game-deploy-mech.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/functions/game-deploy-mech.test.js`:

```javascript
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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
  EVT_DEPLOY_MECH: 'deploy_mech',
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const UNIT_ID = 'unit-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-deploy-mech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  game_id: GAME_ID,
  unit_id: UNIT_ID,
  system_key: '0,0',
  target_planet_name: 'Mecatol Rex',
}

function mockDb({ playerFaction = 'Arborec', unitFaction = 'Arborec', planetOwned = true, upsertError = null, destroyError = null } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: PLAYER_ID, faction: playerFaction }, error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: UNIT_ID, unit_type: 'mech', faction: unitFaction }, error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: planetOwned ? { id: 'planet-id', planet_name: 'Mecatol Rex' } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: upsertError }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: upsertError }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: destroyError }) }),
      }
    }
    return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
    }
  })
}

let handler

beforeAll(async () => {
  global.Deno = { serve: (fn) => { handler = fn } }
  await import('../../../supabase/functions/game-deploy-mech/index.ts')
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue(USER_ID)
  mockDb()
})

describe('game-deploy-mech', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ unit_id: UNIT_ID, system_key: '0,0', target_planet_name: 'Mecatol Rex' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/game_id/)
  })

  it('returns 400 when unit_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, system_key: '0,0', target_planet_name: 'Mecatol Rex' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unit_id/)
  })

  it('returns 409 when faction does not match', async () => {
    mockDb({ unitFaction: 'Hacan' })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/faction/i)
  })

  it('returns 409 when planet is not owned by player', async () => {
    mockDb({ planetOwned: false })
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/planet/i)
  })

  it('deploys mech and returns deployed:true', async () => {
    const res = await handler(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployed).toBe(true)
  })

  it('removes one infantry when replacing_infantry is true', async () => {
    let deleteCalledForInfantry = false
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, faction: 'Arborec' }, error: null }) }) }) }) }
      }
      if (table === 'units') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: UNIT_ID, unit_type: 'mech', faction: 'Arborec' }, error: null }) }) }) }
      }
      if (table === 'game_player_planets') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }) }) }) }) }) }
      }
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockImplementation(() => {
              // First call for mech (returns null — no existing mech row)
              // Second call for infantry (returns { id:'inf-1', count:1 })
              return Promise.resolve({ data: deleteCalledForInfantry ? { id: 'inf-1', count: 1 } : null, error: null })
            }) }) }) }) }) }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => {
              deleteCalledForInfantry = true
              return Promise.resolve({ error: null })
            }),
          }),
        }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }
    })
    const res = await handler(makeRequest({ ...VALID_BODY, replacing_infantry: true }))
    expect(res.status).toBe(200)
    expect(deleteCalledForInfantry).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-deploy-mech.test.js
```

Expected: FAIL — function file does not exist.

- [ ] **Step 3: Create `supabase/functions/game-deploy-mech/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_DEPLOY_MECH } from '../_shared/gameEvents.ts'

type PlayerRow = { id: string; faction: string }
type UnitRow  = { id: string; unit_type: string; faction: string }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; unit_id?: unknown; system_key?: unknown; target_planet_name?: unknown; replacing_infantry?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id         || typeof body.game_id         !== 'string') return errorResponse("'game_id' is required")
  if (!body.unit_id          || typeof body.unit_id          !== 'string') return errorResponse("'unit_id' is required")
  if (!body.system_key       || typeof body.system_key       !== 'string') return errorResponse("'system_key' is required")
  if (!body.target_planet_name || typeof body.target_planet_name !== 'string') return errorResponse("'target_planet_name' is required")

  const replacingInfantry = body.replacing_infantry === true

  // 1. Find activating player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  // 2. Verify the unit is a mech belonging to the player's faction
  const { data: unitRow, error: unitError } = await db
    .from('units')
    .select('id, unit_type, faction')
    .eq('id', body.unit_id)
    .maybeSingle()
  if (unitError) return errorResponse('Database error', 500)
  if (!unitRow) return errorResponse('Mech unit not found', 404)
  if ((unitRow as UnitRow).unit_type !== 'mech')
    return errorResponse('unit_id must reference a mech unit', 409)
  if ((unitRow as UnitRow).faction !== (player as PlayerRow).faction)
    return errorResponse('Faction mismatch: this mech does not belong to your faction', 409)

  // 3. Verify player controls the target planet
  const { data: planetRow, error: planetError } = await db
    .from('game_player_planets')
    .select('id, planet_name')
    .eq('game_id', body.game_id)
    .eq('player_id', (player as PlayerRow).id)
    .eq('planet_name', body.target_planet_name)
    .maybeSingle()
  if (planetError) return errorResponse('Database error', 500)
  if (!planetRow) return errorResponse('Planet not controlled by this player', 409)

  // 4. Place the mech on the planet (upsert game_player_units)
  const { data: existingMech } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', body.game_id)
    .eq('player_id', (player as PlayerRow).id)
    .eq('system_key', body.system_key)
    .eq('unit_type', 'mech')
    .is('on_planet', body.target_planet_name)
    .maybeSingle()

  if (existingMech) {
    const { error } = await db
      .from('game_player_units')
      .update({ count: ((existingMech as { count: number }).count ?? 0) + 1 })
      .eq('id', (existingMech as { id: string }).id)
    if (error) return errorResponse(`Deploy failed: ${error.message}`, 500)
  } else {
    const { error } = await db.from('game_player_units').insert({
      game_id: body.game_id,
      player_id: (player as PlayerRow).id,
      system_key: body.system_key,
      unit_type: 'mech',
      on_planet: body.target_planet_name,
      count: 1,
    })
    if (error) return errorResponse(`Deploy failed: ${error.message}`, 500)
  }

  // 5. Remove one infantry if this is a replacement deploy (e.g., Yin Brotherhood)
  if (replacingInfantry) {
    const { data: infRow } = await db
      .from('game_player_units')
      .select('id, count')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as PlayerRow).id)
      .eq('system_key', body.system_key)
      .eq('unit_type', 'infantry')
      .is('on_planet', body.target_planet_name)
      .maybeSingle()

    if (infRow) {
      const infCount = (infRow as { count: number }).count
      if (infCount <= 1) {
        const { error } = await db.from('game_player_units').delete().eq('id', (infRow as { id: string }).id)
        if (error) return errorResponse(`Infantry removal failed: ${error.message}`, 500)
      } else {
        const { error } = await db.from('game_player_units').update({ count: infCount - 1 }).eq('id', (infRow as { id: string }).id)
        if (error) return errorResponse(`Infantry removal failed: ${error.message}`, 500)
      }
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: (player as PlayerRow).id,
    event_type: EVT_DEPLOY_MECH,
    payload: { unit_id: body.unit_id, system_key: body.system_key, target_planet_name: body.target_planet_name, replacing_infantry: replacingInfantry },
    round: 0,
    phase: 'action',
  })

  return okResponse({ deployed: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Add `EVT_DEPLOY_MECH` to `_shared/gameEvents.ts`**

Open `supabase/functions/_shared/gameEvents.ts`. Find the block of `export const EVT_*` constants and add:

```typescript
export const EVT_DEPLOY_MECH = 'deploy_mech'
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-deploy-mech.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Run the full test suite**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/game-deploy-mech/index.ts supabase/functions/_shared/gameEvents.ts tests/functions/game-deploy-mech.test.js
git commit -m "feat: add game-deploy-mech edge function"
```

---

## Task 5: edgeFunctions.js — deployMech + resolveMechAbility wrappers

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Add the two wrappers**

Open `src/lib/edgeFunctions.js`. After the existing `resolveAbility` export (around line 94), add:

```javascript
export const deployMech = (gameId, unitId, systemKey, targetPlanetName, replacingInfantry = false) =>
  callFunction('game-deploy-mech', {
    game_id: gameId,
    unit_id: unitId,
    system_key: systemKey,
    target_planet_name: targetPlanetName,
    replacing_infantry: replacingInfantry,
  })

export const resolveMechAbility = (gameId, unitId, selections = {}) =>
  callFunction('game-resolve-ability', {
    game_id: gameId,
    source_type: 'mech',
    source_id: unitId,
    selections,
  })
```

- [ ] **Step 2: Run the test suite**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests pass (no test changes needed — covered by useLeaders tests in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/lib/edgeFunctions.js
git commit -m "feat: edgeFunctions — add deployMech and resolveMechAbility wrappers"
```

---

## Task 6: useLeaders.js — expose deployMech and resolveMechAbility

**Files:**
- Modify: `src/hooks/useLeaders.js`
- Modify: `tests/hooks/useLeaders.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/hooks/useLeaders.test.js`. First update the mock of `edgeFunctions.js` at the top to include the new exports:

```javascript
vi.mock('../../src/lib/edgeFunctions.js', () => ({
  unlockCommander: vi.fn().mockResolvedValue({}),
  resolveAbility: vi.fn().mockResolvedValue({}),
  deployMech: vi.fn().mockResolvedValue({}),
  resolveMechAbility: vi.fn().mockResolvedValue({}),
}))
```

Also update the import line:

```javascript
import { unlockCommander, resolveAbility, deployMech, resolveMechAbility } from '../../src/lib/edgeFunctions.js'
```

Then add these two tests at the end of the `describe` block:

```javascript
  it('deployMech calls deployMech with correct arguments', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.deployMech('unit-uuid', '0,0', 'Mecatol Rex', false)
    })
    expect(deployMech).toHaveBeenCalledWith('g1', 'unit-uuid', '0,0', 'Mecatol Rex', false)
  })

  it('resolveMechAbility calls resolveMechAbility with correct arguments', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.resolveMechAbility('unit-uuid', { planet_name: 'Mecatol Rex' })
    })
    expect(resolveMechAbility).toHaveBeenCalledWith('g1', 'unit-uuid', { planet_name: 'Mecatol Rex' })
  })
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/hooks/useLeaders.test.js
```

Expected: FAIL — `result.current.deployMech` is undefined.

- [ ] **Step 3: Update `src/hooks/useLeaders.js`**

Add the new imports and expose the two new functions:

```javascript
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  unlockCommander as unlockCommanderFn,
  resolveAbility as resolveAbilityFn,
  deployMech as deployMechFn,
  resolveMechAbility as resolveMechAbilityFn,
} from '../lib/edgeFunctions.js'

export function useLeaders({ currentPlayer, gameId }) {
  const [agent, setAgent] = useState(null)
  const [commander, setCommander] = useState(null)
  const [hero, setHero] = useState(null)
  const [factionMech, setFactionMech] = useState(null)

  const faction = currentPlayer?.faction

  useEffect(() => {
    if (!faction) return
    let mounted = true

    async function load() {
      const { data: leaders } = await supabase
        .from('leaders')
        .select('*')
        .eq('faction', faction)
      if (!mounted) return
      setAgent((leaders ?? []).find(l => l.leader_type === 'agent') ?? null)
      setCommander((leaders ?? []).find(l => l.leader_type === 'commander') ?? null)
      setHero((leaders ?? []).find(l => l.leader_type === 'hero') ?? null)

      const { data: mechs } = await supabase
        .from('units')
        .select('*')
        .eq('unit_type', 'mech')
        .eq('faction', faction)
      if (!mounted) return
      setFactionMech((mechs ?? [])[0] ?? null)
    }

    load()
    return () => { mounted = false }
  }, [faction])

  const leaderStatus = currentPlayer?.leaders ?? { agent: 'unlocked', commander: 'locked', hero: 'locked' }

  return {
    agent,
    commander,
    hero,
    factionMech,
    leaderStatus,
    unlockCommander: (abilityDefinitionId) => unlockCommanderFn(gameId, abilityDefinitionId),
    unlockHero: (leaderId) => resolveAbilityFn(gameId, null, 'leader', leaderId, { unlock: true }),
    resolveLeaderAbility: (abilityDefinitionId, leaderId, selections) =>
      resolveAbilityFn(gameId, abilityDefinitionId, 'leader', leaderId, selections),
    deployMech: (unitId, systemKey, targetPlanetName, replacingInfantry) =>
      deployMechFn(gameId, unitId, systemKey, targetPlanetName, replacingInfantry),
    resolveMechAbility: (unitId, selections) =>
      resolveMechAbilityFn(gameId, unitId, selections),
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/hooks/useLeaders.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLeaders.js tests/hooks/useLeaders.test.js
git commit -m "feat: useLeaders exposes deployMech and resolveMechAbility"
```

---

## Task 7: LeaderCard, LeaderPanel, MyPanelSection — mech action buttons

**Files:**
- Modify: `src/components/game/LeaderCard.jsx`
- Modify: `src/components/game/LeaderPanel.jsx`
- Modify: `src/components/game/MyPanelSection.jsx`
- Create: `tests/components/game/LeaderCard.test.jsx`

- [ ] **Step 1: Write the failing tests for LeaderCard mech buttons**

Create `tests/components/game/LeaderCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const BASE_MECH = {
  id: 'unit-1',
  name: 'Letani Warrior II',
  unit_type: 'mech',
  cost: 2,
  combat: '6(x2)',
  sustain_damage: true,
  ability_text: 'After you win a ground combat, you may produce 1 infantry.',
  effects: [],
  deploy_trigger: null,
}

describe('LeaderCard (mech)', () => {
  it('renders mech name and ability_text', () => {
    render(<LeaderCard leader={BASE_MECH} status="unlocked" isMech={true} />)
    expect(screen.getByText('Letani Warrior II')).toBeInTheDocument()
    expect(screen.getByText('After you win a ground combat, you may produce 1 infantry.')).toBeInTheDocument()
  })

  it('renders COST and COMBAT stats', () => {
    render(<LeaderCard leader={BASE_MECH} status="unlocked" isMech={true} />)
    expect(screen.getByText(/COST 2/)).toBeInTheDocument()
    expect(screen.getByText(/COMBAT 6\(x2\)/)).toBeInTheDocument()
  })

  it('shows no action button for passive-only mech (no effects, no deploy_trigger)', () => {
    render(<LeaderCard leader={BASE_MECH} status="unlocked" isMech={true} />)
    expect(screen.queryByRole('button', { name: /DEPLOY/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /USE ABILITY/i })).toBeNull()
  })

  it('shows DEPLOY button when deploy_trigger is set', () => {
    const onDeploy = vi.fn()
    const mech = { ...BASE_MECH, deploy_trigger: 'ground_combat_start' }
    render(<LeaderCard leader={mech} status="unlocked" isMech={true} onDeploy={onDeploy} />)
    const btn = screen.getByRole('button', { name: /DEPLOY/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onDeploy).toHaveBeenCalledTimes(1)
  })

  it('shows USE ABILITY button when effects array is non-empty', () => {
    const onUseMechAbility = vi.fn()
    const mech = { ...BASE_MECH, effects: [{ op: 'spend_trade_goods', amount: 2 }] }
    render(<LeaderCard leader={mech} status="unlocked" isMech={true} onUseMechAbility={onUseMechAbility} />)
    const btn = screen.getByRole('button', { name: /USE ABILITY/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onUseMechAbility).toHaveBeenCalledTimes(1)
  })

  it('can show both DEPLOY and USE ABILITY when mech has both', () => {
    const mech = { ...BASE_MECH, deploy_trigger: 'after_tech_research', effects: [{ op: 'draw_action_card' }] }
    render(
      <LeaderCard leader={mech} status="unlocked" isMech={true} onDeploy={vi.fn()} onUseMechAbility={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /DEPLOY/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /USE ABILITY/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: FAIL — mech shows no buttons; `onDeploy` / `onUseMechAbility` props not wired.

- [ ] **Step 3: Update `src/components/game/LeaderCard.jsx` — add mech buttons**

Replace the `if (isMech)` block inside `let actionButton = null; if (isMech) { actionButton = null; }` (lines 30-31):

```jsx
  if (isMech) {
    const hasDeploy = !!leader.deploy_trigger
    const hasActiveEffect = Array.isArray(leader.effects) && leader.effects.length > 0
    if (hasDeploy || hasActiveEffect) {
      actionButton = (
        <div className="flex gap-2 flex-wrap mt-auto pt-1">
          {hasDeploy && (
            <button className="btn-ghost text-xs" onClick={() => onDeploy?.()}>
              DEPLOY
            </button>
          )}
          {hasActiveEffect && (
            <button className="btn-primary text-xs" onClick={() => onUseMechAbility?.()}>
              USE ABILITY
            </button>
          )}
        </div>
      )
    }
  }
```

Also update the bottom of the render: the mech buttons are now inside `actionButton`, so the existing `{!isPurged && actionButton && ...}` block handles them correctly — but since `isMech` cards never `isPurged`, this is fine. Remove the separate `{!isPurged && actionButton && <div>...` wrapper for mechs since `actionButton` for mechs already includes the wrapping `div`. Actually — just leave the existing render structure unchanged; the `actionButton` variable for mechs now contains the button group with its own `mt-auto pt-1` div, same as non-mech cards. The outer `{!isPurged && actionButton && (<div className="mt-auto pt-1">{actionButton}</div>)}` would double-wrap. Fix this by using a fragment instead of a div wrapper for mechs:

Replace the existing render footer:

```jsx
      {!isPurged && actionButton && (
        <div className="mt-auto pt-1">{actionButton}</div>
      )}
```

with:

```jsx
      {!isPurged && actionButton}
```

And update the non-mech `actionButton` assignments to include the wrapper div themselves. Specifically, replace each non-mech `actionButton = (<button ...>)` with `actionButton = (<div className="mt-auto pt-1"><button ...></button></div>)` for agent unlocked, agent exhausted, commander locked, commander unlocked, hero locked, and hero unlocked.

**Full updated `LeaderCard.jsx`:**

```jsx
export default function LeaderCard({ leader, status, onUseAbility, onUnlock, isMech = false, onDeploy, onUseMechAbility }) {
  if (!leader) return null;

  const abilityText = leader.ability_text || leader.text;
  const isPurged = status === 'purged';

  const typeBadge = leader.leader_type && (
    <span className="label uppercase text-xs px-1 py-0.5 border border-border rounded">
      {leader.leader_type}
    </span>
  );

  const statusChip = status && (
    <span
      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
        status === 'unlocked'
          ? 'bg-success/20 text-success'
          : status === 'exhausted'
          ? 'bg-warning/20 text-warning'
          : status === 'purged'
          ? 'bg-danger/20 text-danger'
          : 'bg-muted/20 text-muted'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );

  let actionButton = null;
  if (isMech) {
    const hasDeploy = !!leader.deploy_trigger;
    const hasActiveEffect = Array.isArray(leader.effects) && leader.effects.length > 0;
    if (hasDeploy || hasActiveEffect) {
      actionButton = (
        <div className="flex gap-2 flex-wrap mt-auto pt-1">
          {hasDeploy && (
            <button className="btn-ghost text-xs" onClick={() => onDeploy?.()}>
              DEPLOY
            </button>
          )}
          {hasActiveEffect && (
            <button className="btn-primary text-xs" onClick={() => onUseMechAbility?.()}>
              USE ABILITY
            </button>
          )}
        </div>
      );
    }
  } else if (leader.leader_type === 'agent') {
    if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" onClick={() => onUseAbility(leader)}>
            USE ABILITY
          </button>
        </div>
      );
    } else if (status === 'exhausted') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" disabled>
            USE ABILITY
          </button>
        </div>
      );
    }
  } else if (leader.leader_type === 'commander') {
    if (status === 'locked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-ghost text-xs" onClick={() => onUnlock(leader)}>
            CHECK UNLOCK
          </button>
        </div>
      );
    } else if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <p className="text-xs italic text-muted">Passive — always active</p>
        </div>
      );
    }
  } else if (leader.leader_type === 'hero') {
    if (status === 'locked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-ghost text-xs" onClick={() => onUnlock(leader)}>
            CHECK UNLOCK
          </button>
        </div>
      );
    } else if (status === 'unlocked') {
      actionButton = (
        <div className="mt-auto pt-1">
          <button className="btn-primary text-xs" onClick={() => onUseAbility(leader)}>
            USE ABILITY
          </button>
        </div>
      );
    }
  }

  return (
    <div className={`panel-inset flex flex-col gap-2 p-3 ${isPurged ? 'opacity-40' : ''}`}>
      {!isMech && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-sm text-bright">{leader.name}</span>
          {typeBadge}
          {statusChip}
        </div>
      )}
      {isMech && (
        <span className="font-display text-sm text-bright">{leader.name}</span>
      )}
      {abilityText && (
        <p className="text-xs text-dim leading-relaxed">{abilityText}</p>
      )}
      {isMech && (
        <div className="flex items-center gap-3 text-xs font-mono text-muted">
          {leader.cost !== undefined && (
            <span>COST {leader.cost}</span>
          )}
          {leader.combat !== undefined && (
            <span>COMBAT {leader.combat}</span>
          )}
          <span>SUSTAIN</span>
        </div>
      )}
      {!isMech && status === 'locked' && leader.unlock_criteria && (
        <p className="text-xs text-muted italic">{leader.unlock_criteria}</p>
      )}
      {!isPurged && actionButton}
    </div>
  );
}
```

- [ ] **Step 4: Run the LeaderCard tests to confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Update `LeaderPanel.jsx` — manage deploy modal + new props**

Replace the entire file content:

```jsx
import { useState } from 'react'
import LeaderCard from './LeaderCard';
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

export default function LeaderPanel({
  agent, commander, hero, factionMech,
  leaderStatus, onUseAbility, onUnlock,
  planets = [], currentPlayerId,
  onDeployMech, onUseMechAbility,
}) {
  const [showDeployModal, setShowDeployModal] = useState(false)

  function handleDeployConfirm(selected) {
    if (!selected?.length || !factionMech) return
    const planet = selected[0]
    const replacingInfantry = factionMech.deploy_trigger === 'ground_combat_start'
    onDeployMech?.(factionMech.id, planet.system_key, planet.planet_name, replacingInfantry)
    setShowDeployModal(false)
  }

  return (
    <div className="panel w-full max-w-lg flex flex-col gap-4">
      <p className="label">LEADERS</p>
      <div className="grid grid-cols-2 gap-3">
        <LeaderCard
          leader={agent}
          status={leaderStatus?.agent}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={commander}
          status={leaderStatus?.commander}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={hero}
          status={leaderStatus?.hero}
          onUseAbility={onUseAbility}
          onUnlock={onUnlock}
        />
        <LeaderCard
          leader={factionMech}
          status="unlocked"
          isMech={true}
          onDeploy={() => setShowDeployModal(true)}
          onUseMechAbility={() => onUseMechAbility?.(factionMech)}
        />
      </div>
      {showDeployModal && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayerId}
          scope="own"
          label="Deploy mech — select a planet"
          onConfirm={handleDeployConfirm}
          onClose={() => setShowDeployModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update `MyPanelSection.jsx` — thread new LeaderPanel props**

Find the `<LeaderPanel ...>` block (around line 135) and add the four new props:

```jsx
      {leaders && (
        <LeaderPanel
          agent={leaders.agent}
          commander={leaders.commander}
          hero={leaders.hero}
          factionMech={leaders.factionMech}
          leaderStatus={leaders.leaderStatus}
          planets={planets}
          currentPlayerId={player?.id}
          onDeployMech={(unitId, systemKey, planetName, replacingInfantry) =>
            leaders.deployMech(unitId, systemKey, planetName, replacingInfantry)
          }
          onUseMechAbility={(mech) => leaders.resolveMechAbility(mech.id, {})}
          onUnlock={(leader) =>
            leader.leader_type === 'commander'
              ? leaders.unlockCommander(leader.id)
              : leaders.unlockHero(leader.id)
          }
          onUseAbility={(leader) => leaders.resolveLeaderAbility(leader.ability_definition_id, leader.id, {})}
        />
      )}
```

- [ ] **Step 7: Run the full test suite**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests pass (existing `LeaderPanel`, `MyPanelSection` tests should still pass — new props are additive with defaults).

- [ ] **Step 8: Commit**

```bash
git add src/components/game/LeaderCard.jsx src/components/game/LeaderPanel.jsx src/components/game/MyPanelSection.jsx tests/components/game/LeaderCard.test.jsx
git commit -m "feat: mech DEPLOY and USE ABILITY buttons on LeaderCard"
```

---

## Task 8: Deploy the new edge function

- [ ] **Step 1: Deploy `game-deploy-mech`**

```bash
supabase functions deploy game-deploy-mech --no-verify-jwt
```

Expected: "Deployed Function game-deploy-mech"

- [ ] **Step 2: Re-deploy `game-resolve-ability` (source_type='mech' change)**

```bash
supabase functions deploy game-resolve-ability --no-verify-jwt
```

Expected: "Deployed Function game-resolve-ability"

- [ ] **Step 3: Re-deploy `admin-import-units` (new field defaults)**

```bash
supabase functions deploy admin-import-units --no-verify-jwt
```

Expected: "Deployed Function admin-import-units"

- [ ] **Step 4: Commit a deploy record note**

```bash
git commit --allow-empty -m "chore: deploy game-deploy-mech, game-resolve-ability, admin-import-units for Phase 39"
```

---

## Task 9: Update _index.md and mark Phase 39 done

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Add Phase 39 rows to `_index.md`**

In the `## All Spec Files` table, after the last Phase 38 row (around line 267), add:

```markdown
| [migration-050-mech-abilities](migration-050-mech-abilities.md) | `supabase/migrations/050_mech_abilities.sql` | 39 | Mech Unit Card Abilities | done | — |
| [fn-admin-import-units-mech](fn-admin-import-units-mech.md) | `supabase/functions/admin-import-units/index.ts` | 39 | Mech Unit Card Abilities | done | migration-050-mech-abilities |
| [lib-importSchemas-mech](lib-importSchemas-mech.md) | `src/lib/importSchemas.js` | 39 | Mech Unit Card Abilities | done | migration-050-mech-abilities |
| [fn-game-resolve-ability-mech](fn-game-resolve-ability-mech.md) | `supabase/functions/game-resolve-ability/index.ts` | 39 | Mech Unit Card Abilities | done | migration-050-mech-abilities |
| [fn-game-deploy-mech](fn-game-deploy-mech.md) | `supabase/functions/game-deploy-mech/index.ts` | 39 | Mech Unit Card Abilities | done | migration-050-mech-abilities |
| [client-edgeFunctions-mech](client-edgeFunctions-mech.md) | `src/lib/edgeFunctions.js` | 39 | Mech Unit Card Abilities | done | fn-game-deploy-mech, fn-game-resolve-ability-mech |
| [hook-useLeaders-mech](hook-useLeaders-mech.md) | `src/hooks/useLeaders.js` | 39 | Mech Unit Card Abilities | done | client-edgeFunctions-mech |
| [component-LeaderCard-mech](component-LeaderCard-mech.md) | `src/components/game/LeaderCard.jsx` | 39 | Mech Unit Card Abilities | done | hook-useLeaders-mech |
| [component-LeaderPanel-mech](component-LeaderPanel-mech.md) | `src/components/game/LeaderPanel.jsx` | 39 | Mech Unit Card Abilities | done | component-LeaderCard-mech |
| [component-MyPanelSection-mech](component-MyPanelSection-mech.md) | `src/components/game/MyPanelSection.jsx` | 39 | Mech Unit Card Abilities | done | component-LeaderPanel-mech |
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: update _index.md with Phase 39 Mech Unit Card Abilities spec rows"
```
