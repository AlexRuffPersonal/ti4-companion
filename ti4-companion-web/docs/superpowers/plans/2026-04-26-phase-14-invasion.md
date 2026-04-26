# Phase 14 — Full Invasion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full TI4 Invasion step — Bombardment, Space Cannon Defense, and unified hit-assignment — building on the existing Phase 11 ground combat and Phase 13 AFB specs.

**Architecture:** All hit assignment flows (AFB, bombardment, SCD, space combat, ground combat) route through a single `game-assign-hits` function dispatched on `combat.phase` + `combat.combat_type`. Bombardment state lives in temporary `game_combats` rows (`combat_type='bombardment'`), gated by `game_system_activations.bombardment_done` before troops can commit.

**Tech Stack:** Supabase Edge Functions (TypeScript/Deno), PostgreSQL, React 19, Vitest 4, @testing-library/react

**Spec files:** All in `ti4-companion-web/docs/superpowers/plans/main_plan/`. Read `_standards.md` before any spec file.

---

## Task 1: Migration 031

**Spec:** `migration-031-invasion.md`

**Files:**
- Create: `supabase/migrations/031_invasion.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Extend combat_type CHECK
ALTER TABLE game_combats DROP CONSTRAINT game_combats_combat_type_check;
ALTER TABLE game_combats ADD CONSTRAINT game_combats_combat_type_check
  CHECK (combat_type IN ('space', 'ground', 'bombardment'));

-- Extend phase CHECK (verify existing constraint name with \d game_combats in psql)
ALTER TABLE game_combats DROP CONSTRAINT game_combats_phase_check;
ALTER TABLE game_combats ADD CONSTRAINT game_combats_phase_check
  CHECK (phase IN (
    'barrage',
    'afb_attacker_assign', 'afb_defender_assign',
    'attacker_roll', 'defender_roll',
    'attacker_assign', 'defender_assign',
    'bombardment_assign',
    'scd_fire', 'scd_assign',
    'complete'
  ));

-- SCD result columns
ALTER TABLE game_combats
  ADD COLUMN scd_dice  JSONB,
  ADD COLUMN scd_hits  INTEGER NOT NULL DEFAULT 0;

-- Bombardment done gate
ALTER TABLE game_system_activations
  ADD COLUMN bombardment_done BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply and verify**

```bash
cd supabase && supabase db push
```

Expected: no errors. Confirm with `supabase db diff` showing no pending changes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/031_invasion.sql
git commit -m "feat: migration 031 — invasion phases, bombardment combat type, SCD columns"
```

---

## Task 2: Extend `game-assign-hits`

**Spec:** `fn-game-assign-hits.md`

**Files:**
- Modify: `supabase/functions/game-assign-hits/index.ts`
- Modify: `tests/functions/game-assign-hits.test.js`

- [ ] **Step 1: Write failing tests for `afb_attacker_assign`**

In `tests/functions/game-assign-hits.test.js`, add:

```js
describe('afb_attacker_assign', () => {
  it('removes fighters from attacker and transitions to afb_defender_assign when defender also has hits', async () => {
    mockDb({ phase: 'afb_attacker_assign', combat_type: 'space',
      barrage_defender_hits: 2, barrage_attacker_hits: 1,
      attacker_player_id: PLAYER_ID })
    mockUnits([{ unit_type: 'fighter', count: 3, on_planet: null, player_id: PLAYER_ID }])
    const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1',
      casualties: [{ unit_type: 'fighter', count: 2 }] }))
    expect(res.status).toBe(200)
    expect(db.from).toHaveBeenCalledWith('game_player_units') // update called
    const updateCall = findUpdateCall(db, 'game_combats')
    expect(updateCall.phase).toBe('afb_defender_assign')
  })

  it('409 if caller is not attacker', async () => {
    mockDb({ phase: 'afb_attacker_assign', attacker_player_id: 'other' })
    const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1', casualties: [] }))
    expect(res.status).toBe(409)
  })

  it('409 if casualties contain non-fighter', async () => {
    mockDb({ phase: 'afb_attacker_assign', attacker_player_id: PLAYER_ID, barrage_defender_hits: 1 })
    const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1',
      casualties: [{ unit_type: 'cruiser', count: 1 }] }))
    expect(res.status).toBe(409)
  })

  it('skips to attacker_roll when defender has no hits', async () => {
    mockDb({ phase: 'afb_attacker_assign', barrage_defender_hits: 1, barrage_attacker_hits: 0,
      attacker_player_id: PLAYER_ID })
    mockUnits([{ unit_type: 'fighter', count: 3, on_planet: null, player_id: PLAYER_ID }])
    const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1',
      casualties: [{ unit_type: 'fighter', count: 1 }] }))
    expect(res.status).toBe(200)
    expect(findUpdateCall(db, 'game_combats').phase).toBe('attacker_roll')
  })
})
```

Add similar describe blocks for `afb_defender_assign`, `bombardment_assign`, `scd_assign` following the spec pseudocode in `fn-game-assign-hits.md`.

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-assign-hits.test.js
```

Expected: new test cases fail.

- [ ] **Step 3: Add new phase cases to the handler**

In `supabase/functions/game-assign-hits/index.ts`, add to the phase dispatch:

```ts
case 'afb_attacker_assign': {
  if (player.id !== combat.attacker_player_id) return errorResponse('Not the attacker', 409)
  const hitsToAssign = combat.barrage_defender_hits
  const fighters = await db.from('game_player_units')
    .select('*').eq('game_id', body.game_id).eq('system_key', combat.system_key)
    .eq('player_id', combat.attacker_player_id).is('on_planet', null).eq('unit_type', 'fighter')
  if (body.casualties.some((c: any) => c.unit_type !== 'fighter'))
    return errorResponse('AFB hits must target fighters only', 409)
  const total = body.casualties.reduce((s: number, c: any) => s + c.count, 0)
  const maxRequired = Math.min(hitsToAssign, fighters.data?.reduce((s: number, u: any) => s + u.count, 0) ?? 0)
  if (total !== maxRequired) return errorResponse('Incorrect casualty count', 409)
  await applyCasualties(body.game_id, combat.system_key, null, combat.attacker_player_id, body.casualties, unitDefs)
  const nextPhase = combat.barrage_attacker_hits > 0 ? 'afb_defender_assign' : 'attacker_roll'
  await db.from('game_combats').update({ phase: nextPhase }).eq('id', body.combat_id)
  return okResponse({ phase: nextPhase })
}

case 'afb_defender_assign': {
  if (player.id !== combat.defender_player_id) return errorResponse('Not the defender', 409)
  const hitsToAssign = combat.barrage_attacker_hits
  const fighters = await db.from('game_player_units')
    .select('*').eq('game_id', body.game_id).eq('system_key', combat.system_key)
    .eq('player_id', combat.defender_player_id).is('on_planet', null).eq('unit_type', 'fighter')
  if (body.casualties.some((c: any) => c.unit_type !== 'fighter'))
    return errorResponse('AFB hits must target fighters only', 409)
  const total = body.casualties.reduce((s: number, c: any) => s + c.count, 0)
  const maxRequired = Math.min(hitsToAssign, fighters.data?.reduce((s: number, u: any) => s + u.count, 0) ?? 0)
  if (total !== maxRequired) return errorResponse('Incorrect casualty count', 409)
  await applyCasualties(body.game_id, combat.system_key, null, combat.defender_player_id, body.casualties, unitDefs)
  await db.from('game_combats').update({ phase: 'attacker_roll' }).eq('id', body.combat_id)
  return okResponse({ phase: 'attacker_roll' })
}

case 'bombardment_assign': {
  if (player.id !== combat.defender_player_id) return errorResponse('Not the defender', 409)
  const planetUnits = await db.from('game_player_units').select('*')
    .eq('game_id', body.game_id).eq('system_key', combat.system_key)
    .eq('on_planet', combat.planet_name).eq('player_id', combat.defender_player_id)
  const total = body.casualties.reduce((s: number, c: any) => s + c.count, 0)
  const maxRequired = Math.min(combat.attacker_hits, planetUnits.data?.reduce((s: number, u: any) => s + u.count, 0) ?? 0)
  if (total !== maxRequired) return errorResponse('Incorrect casualty count', 409)
  await applyCasualties(body.game_id, combat.system_key, combat.planet_name, combat.defender_player_id, body.casualties, unitDefs)
  await db.from('game_combats').update({ phase: 'complete' }).eq('id', body.combat_id)
  return okResponse({ phase: 'complete' })
}

case 'scd_assign': {
  if (player.id !== combat.attacker_player_id) return errorResponse('Not the attacker', 409)
  const planetUnits = await db.from('game_player_units').select('*')
    .eq('game_id', body.game_id).eq('system_key', combat.system_key)
    .eq('on_planet', combat.planet_name).eq('player_id', combat.attacker_player_id)
  const total = body.casualties.reduce((s: number, c: any) => s + c.count, 0)
  const maxRequired = Math.min(combat.scd_hits, planetUnits.data?.reduce((s: number, u: any) => s + u.count, 0) ?? 0)
  if (total !== maxRequired) return errorResponse('Incorrect casualty count', 409)
  await applyCasualties(body.game_id, combat.system_key, combat.planet_name, combat.attacker_player_id, body.casualties, unitDefs)
  await db.from('game_combats').update({ phase: 'attacker_roll' }).eq('id', body.combat_id)
  return okResponse({ phase: 'attacker_roll' })
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/functions/game-assign-hits.test.js
```

Expected: all passing.

- [ ] **Step 5: Deploy**

```bash
cd .. && supabase functions deploy game-assign-hits --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-assign-hits/ tests/functions/game-assign-hits.test.js
git commit -m "feat: extend game-assign-hits for AFB assign, bombardment assign, SCD assign phases"
```

---

## Task 3: Modify `game-fire-anti-fighter-barrage`

**Spec:** `fn-game-fire-anti-fighter-barrage.md`

**Files:**
- Modify: `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
- Modify: `tests/functions/game-fire-anti-fighter-barrage.test.js`

- [ ] **Step 1: Update tests**

In `tests/functions/game-fire-anti-fighter-barrage.test.js`, replace the auto-destroy assertions:

```js
it('sets phase to afb_attacker_assign when attacker takes hits', async () => {
  mockDb({ phase: 'barrage', attacker_player_id: PLAYER_ID, ... })
  mockRolls({ atkRolls: [10, 10], defRolls: [5] }) // 2 atk hits, 0 def hits
  const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1' }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.phase).toBe('afb_attacker_assign')
  // No game_player_units mutations
  expect(db.from).not.toHaveBeenCalledWith(expect.stringContaining('game_player_units'))
})

it('sets phase to afb_defender_assign when only defender takes hits', async () => {
  mockRolls({ atkRolls: [5], defRolls: [10] }) // 0 atk hits, 1 def hit
  const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1' }))
  expect((await res.json()).phase).toBe('afb_defender_assign')
})

it('sets phase to attacker_roll when no hits on either side', async () => {
  mockRolls({ atkRolls: [1], defRolls: [2] })
  const res = await handler(REQ({ game_id: GAME_ID, combat_id: 'c1' }))
  expect((await res.json()).phase).toBe('attacker_roll')
})
```

- [ ] **Step 2: Run tests — verify failures**

```bash
npx vitest run tests/functions/game-fire-anti-fighter-barrage.test.js
```

- [ ] **Step 3: Remove `applyAfbHits` and add phase logic**

In `supabase/functions/game-fire-anti-fighter-barrage/index.ts`:

1. Delete the `applyAfbHits` helper function entirely.
2. Replace the auto-apply calls with phase transition logic:

```ts
// Remove: await applyAfbHits(...)
// Remove: await applyAfbHits(...)

const nextPhase = atkHits > 0
  ? 'afb_attacker_assign'
  : defHits > 0
    ? 'afb_defender_assign'
    : 'attacker_roll'

await db.from('game_combats').update({
  barrage_attacker_dice: atkResults,
  barrage_attacker_hits: atkHits,
  barrage_defender_dice: defResults,
  barrage_defender_hits: defHits,
  phase: nextPhase,
}).eq('id', body.combat_id)

return okResponse({
  barrage_attacker_dice: atkResults,
  barrage_attacker_hits: atkHits,
  barrage_defender_dice: defResults,
  barrage_defender_hits: defHits,
  phase: nextPhase,
})
```

- [ ] **Step 4: Run tests — verify passing**

```bash
npx vitest run tests/functions/game-fire-anti-fighter-barrage.test.js
```

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy game-fire-anti-fighter-barrage --no-verify-jwt
git add supabase/functions/game-fire-anti-fighter-barrage/ tests/functions/game-fire-anti-fighter-barrage.test.js
git commit -m "feat: game-fire-anti-fighter-barrage — remove auto-assign, add afb assign phases"
```

---

## Task 4: `game-fire-bombardment`

**Spec:** `fn-game-fire-bombardment.md`

**Files:**
- Create: `supabase/functions/game-fire-bombardment/index.ts`
- Create: `tests/functions/game-fire-bombardment.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/functions/game-fire-bombardment.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../supabase/functions/_shared/auth.ts', () => { ... }) // STD_MOCKS
vi.mock('../../supabase/functions/_shared/db.ts', () => ({ db: { from: vi.fn() } }))

const USER_ID = 'user-1', GAME_ID = 'game-1', PLAYER_ID = 'player-1'

describe('game-fire-bombardment', () => {
  it('204 CORS preflight', async () => { /* TCORS */ })
  it('401 unauthenticated', async () => { /* T401 */ })
  it('400 missing game_id', async () => { /* T400 */ })
  it('400 missing system_key', async () => { /* T400 */ })
  it('400 missing planet_name', async () => { /* T400 */ })
  it('409 system not activated', async () => { /* T409_ACTIVATED */ })
  it('409 planet not in tile', async () => { /* ... */ })
  it('409 planet already bombarded', async () => { /* mock existing bombardment row */ })
  it('409 no ground forces on planet', async () => { /* mock defenderUnits=[] */ })
  it('409 planetary shield active without war sun', async () => { /* mock shieldDefs, no war sun */ })
  it('409 no bombardment units in space area', async () => { /* mock bombDefs=[] */ })

  it('creates bombardment_assign row when hits > 0', async () => {
    // mock: 1 dreadnought (bombardment='5'), 2 defender infantry, no shield
    // mock roll: [8] → 1 hit
    mockDb({ ... })
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '1,2', planet_name: 'Mecatol Rex' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hits).toBe(1)
    expect(insertedCombat.phase).toBe('bombardment_assign')
    expect(insertedCombat.combat_type).toBe('bombardment')
  })

  it('creates complete row when hits = 0', async () => {
    // mock roll: [2] → 0 hits
    const res = await handler(REQ({ ... }))
    expect(insertedCombat.phase).toBe('complete')
  })

  it('war sun overrides planetary shield', async () => {
    // mock shieldDefs present, war_sun in attacker space units
    const res = await handler(REQ({ ... }))
    expect(res.status).toBe(200) // should not 409
  })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/functions/game-fire-bombardment.test.js
```

- [ ] **Step 3: Implement the function**

Create `supabase/functions/game-fire-bombardment/index.ts` following `fn-game-fire-bombardment.md`. Use `parseStat` on the `bombardment` column (same pattern as AFB uses the `afb` column).

Key sections:

```ts
// Planetary Shield check
const defTypes = [...new Set(defenderUnits.data.map((u: any) => u.unit_type))]
const { data: shieldDefs } = await db.from('units').select('name')
  .in('name', defTypes).eq('planetary_shield', true)
if (shieldDefs?.length > 0) {
  const atkTypes = [...new Set(atkSpaceUnits.data.map((u: any) => u.unit_type))]
  const { data: warSuns } = await db.from('units').select('name')
    .in('name', atkTypes).eq('unit_type', 'war_sun')
  if (!warSuns?.length) return errorResponse('Planetary Shield is active — cannot bombard', 409)
}

// Roll and insert
const phase = hits > 0 ? 'bombardment_assign' : 'complete'
await db.from('game_combats').insert({
  game_id: body.game_id, system_key: body.system_key,
  combat_type: 'bombardment', planet_name: body.planet_name,
  attacker_player_id: player.id, defender_player_id: defenderId,
  phase, attacker_dice: results, attacker_hits: hits, round: game.round,
})
```

- [ ] **Step 4: Run tests — verify passing**

```bash
npx vitest run tests/functions/game-fire-bombardment.test.js
```

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy game-fire-bombardment --no-verify-jwt
git add supabase/functions/game-fire-bombardment/ tests/functions/game-fire-bombardment.test.js
git commit -m "feat: game-fire-bombardment — roll bombardment dice, create bombardment combat row"
```

---

## Task 5: `game-advance-bombardment`

**Spec:** `fn-game-advance-bombardment.md`

**Files:**
- Create: `supabase/functions/game-advance-bombardment/index.ts`
- Create: `tests/functions/game-advance-bombardment.test.js`

- [ ] **Step 1: Write failing tests**

```js
describe('game-advance-bombardment', () => {
  it('204 CORS preflight', ...)
  it('401 unauthenticated', ...)
  it('400 missing game_id', ...)
  it('400 missing system_key', ...)
  it('409 system not activated', ...)

  it('409 when pending bombardment rows exist', async () => {
    mockDb({ pending: [{ id: 'c1', phase: 'bombardment_assign' }] })
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '1,2' }))
    expect(res.status).toBe(409)
  })

  it('sets bombardment_done=true when no pending rows', async () => {
    mockDb({ pending: [] })
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '1,2' }))
    expect(res.status).toBe(200)
    expect(activationUpdate.bombardment_done).toBe(true)
    expect((await res.json()).ok).toBe(true)
  })

  it('succeeds with zero bombardment rows (attacker chose not to bombard)', async () => {
    mockDb({ pending: [] }) // no rows at all
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '1,2' }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/functions/game-advance-bombardment.test.js
```

- [ ] **Step 3: Implement**

```ts
// Check pending
const { data: pending } = await db.from('game_combats').select('id')
  .eq('game_id', body.game_id).eq('system_key', body.system_key)
  .eq('combat_type', 'bombardment').eq('phase', 'bombardment_assign')
if (pending?.length > 0) return errorResponse('Unresolved bombardment hits — assign before advancing', 409)

// Set done
await db.from('game_system_activations').update({ bombardment_done: true })
  .eq('game_id', body.game_id).eq('system_key', body.system_key)
  .eq('player_id', player.id).eq('round', game.round)

return okResponse({ ok: true })
```

- [ ] **Step 4: Run, deploy, commit**

```bash
npx vitest run tests/functions/game-advance-bombardment.test.js
supabase functions deploy game-advance-bombardment --no-verify-jwt
git add supabase/functions/game-advance-bombardment/ tests/functions/game-advance-bombardment.test.js
git commit -m "feat: game-advance-bombardment — gate on resolved hits, set bombardment_done"
```

---

## Task 6: `game-commit-ground-forces`

**Spec:** `fn-game-commit-ground-forces.md`

**Files:**
- Create: `supabase/functions/game-commit-ground-forces/index.ts`
- Create: `tests/functions/game-commit-ground-forces.test.js`
- Delete (do not implement): `game-land-troops` (spec superseded)

- [ ] **Step 1: Write failing tests**

```js
describe('game-commit-ground-forces', () => {
  it('204 CORS', ...) it('401', ...) it('400 missing game_id', ...) it('400 troop_count=0', ...)
  it('409 system not activated', ...)
  it('409 planet not in tile', ...)

  it('409 bombardment not resolved when bombardment ships present', async () => {
    mockDb({ bombDefs: [{ name: 'dreadnought' }], bombardment_done: false })
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '1,2',
      planet_name: 'Mecatol Rex', troop_count: 2 }))
    expect(res.status).toBe(409)
  })

  it('claims planet when no defenders', async () => {
    mockDb({ defenders: [], bombDefs: [], bombardment_done: true })
    const res = await handler(REQ({ ... }))
    expect(res.status).toBe(200)
    expect((await res.json()).claimed).toBe(true)
  })

  it('creates ground combat at scd_fire when defender has space cannon units', async () => {
    mockDb({ defenders: [{ player_id: 'enemy' }], scdDefs: [{ name: 'pds' }] })
    const res = await handler(REQ({ ... }))
    expect(insertedCombat.phase).toBe('scd_fire')
    expect(insertedCombat.combat_type).toBe('ground')
  })

  it('creates ground combat at attacker_roll when no SCD units', async () => {
    mockDb({ defenders: [{ player_id: 'enemy' }], scdDefs: [] })
    const res = await handler(REQ({ ... }))
    expect(insertedCombat.phase).toBe('attacker_roll')
  })

  it('allows commit when bombardment_done=true even with bombardment ships', async () => {
    mockDb({ bombDefs: [{ name: 'dreadnought' }], bombardment_done: true, defenders: [] })
    const res = await handler(REQ({ ... }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/functions/game-commit-ground-forces.test.js
```

- [ ] **Step 3: Implement** following `fn-game-commit-ground-forces.md`. Structure is similar to `game-land-troops`. Three key additions:

```ts
// 1. Bombardment gate
const { data: bombDefs } = await db.from('units').select('name')
  .in('name', atkTypes).not('bombardment', 'is', null)
if (bombDefs?.length > 0 && !activation.data?.bombardment_done)
  return errorResponse('Must resolve bombardment phase before committing ground forces', 409)

// 2. SCD detection
const defTypes = [...new Set(defenders.data.map((u: any) => u.unit_type))]
const { data: scdDefs } = await db.from('units').select('name')
  .in('name', defTypes).not('space_cannon', 'is', null)
const initialPhase = scdDefs?.length > 0 ? 'scd_fire' : 'attacker_roll'

// 3. Combat insert with initialPhase
await db.from('game_combats').insert({
  game_id: body.game_id, system_key: body.system_key,
  combat_type: 'ground', planet_name: body.planet_name,
  attacker_player_id: player.id,
  defender_player_id: defenders.data[0].player_id,
  phase: initialPhase, round: game.round,
})
```

- [ ] **Step 4: Run, deploy, commit**

```bash
npx vitest run tests/functions/game-commit-ground-forces.test.js
supabase functions deploy game-commit-ground-forces --no-verify-jwt
git add supabase/functions/game-commit-ground-forces/ tests/functions/game-commit-ground-forces.test.js
git commit -m "feat: game-commit-ground-forces — replaces game-land-troops, adds bombardment gate and SCD phase"
```

---

## Task 7: `game-fire-space-cannon-defense`

**Spec:** `fn-game-fire-space-cannon-defense.md`

**Files:**
- Create: `supabase/functions/game-fire-space-cannon-defense/index.ts`
- Create: `tests/functions/game-fire-space-cannon-defense.test.js`

- [ ] **Step 1: Write failing tests**

```js
describe('game-fire-space-cannon-defense', () => {
  it('204 CORS', ...) it('401', ...) it('400 missing game_id', ...) it('400 missing combat_id', ...)
  it('404 combat not found', ...)

  it('409 not a ground combat', async () => {
    mockDb({ combat: { combat_type: 'space', phase: 'scd_fire' } })
    expect((await handler(REQ({ ... }))).status).toBe(409)
  })

  it('409 not in scd_fire phase', async () => {
    mockDb({ combat: { combat_type: 'ground', phase: 'attacker_roll', defender_player_id: PLAYER_ID } })
    expect((await handler(REQ({ ... }))).status).toBe(409)
  })

  it('409 caller is not defender', async () => {
    mockDb({ combat: { combat_type: 'ground', phase: 'scd_fire', defender_player_id: 'other' } })
    expect((await handler(REQ({ ... }))).status).toBe(409)
  })

  it('409 no space cannon units on planet', async () => {
    mockDb({ combat: { ..., defender_player_id: PLAYER_ID }, scdDefs: [] })
    expect((await handler(REQ({ ... }))).status).toBe(409)
  })

  it('transitions to scd_assign when hits > 0', async () => {
    mockDb({ combat: { ..., defender_player_id: PLAYER_ID }, scdDefs: [{ name: 'pds', space_cannon: '6' }] })
    mockRoll([9]) // 1 hit
    const res = await handler(REQ({ ... }))
    expect(res.status).toBe(200)
    expect(combatUpdate.scd_hits).toBe(1)
    expect(combatUpdate.phase).toBe('scd_assign')
  })

  it('transitions to attacker_roll when hits = 0', async () => {
    mockRoll([3])
    const res = await handler(REQ({ ... }))
    expect(combatUpdate.phase).toBe('attacker_roll')
  })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/functions/game-fire-space-cannon-defense.test.js
```

- [ ] **Step 3: Implement** following `fn-game-fire-space-cannon-defense.md`. Use `parseStat` on the `space_cannon` column.

- [ ] **Step 4: Run, deploy, commit**

```bash
npx vitest run tests/functions/game-fire-space-cannon-defense.test.js
supabase functions deploy game-fire-space-cannon-defense --no-verify-jwt
git add supabase/functions/game-fire-space-cannon-defense/ tests/functions/game-fire-space-cannon-defense.test.js
git commit -m "feat: game-fire-space-cannon-defense — SCD roll and phase transition"
```

---

## Task 8: Client wrappers (`edgeFunctions.js`)

**Spec:** `client-edgeFunctions.md`

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Add Phase 14 exports**

In `src/lib/edgeFunctions.js`, add after existing Phase 13 exports:

```js
// Phase 14
export const fireBombardment = (gameId, systemKey, planetName) =>
  callFunction('game-fire-bombardment', { game_id: gameId, system_key: systemKey, planet_name: planetName })

export const advanceBombardment = (gameId, systemKey) =>
  callFunction('game-advance-bombardment', { game_id: gameId, system_key: systemKey })

export const commitGroundForces = (gameId, systemKey, planetName, troopCount) =>
  callFunction('game-commit-ground-forces', {
    game_id: gameId, system_key: systemKey, planet_name: planetName, troop_count: troopCount
  })

export const fireSpaceCannonDefense = (gameId, combatId) =>
  callFunction('game-fire-space-cannon-defense', { game_id: gameId, combat_id: combatId })

export const assignHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-hits', { game_id: gameId, combat_id: combatId, casualties })
```

- [ ] **Step 2: Run full test suite to check no regressions**

```bash
npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/edgeFunctions.js
git commit -m "feat: edgeFunctions — add Phase 14 invasion wrappers"
```

---

## Task 9: Hook (`useCombat.js`)

**Spec:** `hook-useCombat.md`

**Files:**
- Modify: `src/hooks/useCombat.js`

- [ ] **Step 1: Add Phase 14 imports and dispatchers**

```js
import {
  fireBombardment as fireBombardmentFn,
  advanceBombardment as advanceBombardmentFn,
  commitGroundForces as commitGroundForcesFn,
  fireSpaceCannonDefense as fireSpaceCannonDefenseFn,
  assignHits as assignHitsFn,
} from '../lib/edgeFunctions'
```

Add to returned object:

```js
fireBombardment: (systemKey, planetName) => fireBombardmentFn(gameId, systemKey, planetName),
advanceBombardment: (systemKey) => advanceBombardmentFn(gameId, systemKey),
commitGroundForces: (systemKey, planetName, troopCount) =>
  commitGroundForcesFn(gameId, systemKey, planetName, troopCount),
fireSpaceCannonDefense: () => fireSpaceCannonDefenseFn(gameId, combat?.id),
assignHits: (casualties) => assignHitsFn(gameId, combat?.id, casualties),
```

Derive `hasScdUnits`:

```js
const hasScdUnits = useMemo(() => {
  if (!combat?.planet_name) return false
  return systemUnits.some(u =>
    u.on_planet === combat.planet_name &&
    u.player_id === combat.defender_player_id &&
    unitDefs.get(u.unit_type)?.space_cannon != null
  )
}, [systemUnits, combat, unitDefs])
```

- [ ] **Step 2: Run full suite**

```bash
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCombat.js
git commit -m "feat: useCombat — add Phase 14 invasion dispatchers and hasScdUnits"
```

---

## Task 10: `SpaceCombatModal` — AFB assign branches

**Spec:** `component-SpaceCombatModal.md`

**Files:**
- Modify: `src/components/game/SpaceCombatModal.jsx`
- Modify: `tests/components/game/SpaceCombatModal.test.jsx`

- [ ] **Step 1: Write failing tests**

```js
describe('afb_attacker_assign', () => {
  it('renders FleetDisplay interactive for attacker with hitsToAssign=barrage_defender_hits', () => {
    render(<SpaceCombatModal combat={{ phase: 'afb_attacker_assign',
      barrage_attacker_dice: [...], barrage_defender_hits: 2,
      attacker_player_id: MY_ID }} myPlayerId={MY_ID} ... />)
    expect(screen.getByTestId('fleet-display-attacker')).toHaveAttribute('data-interactive', 'true')
    expect(screen.getByTestId('fleet-display-attacker')).toHaveAttribute('data-hits', '2')
  })

  it('shows waiting when isDefender', () => {
    render(<SpaceCombatModal combat={{ phase: 'afb_attacker_assign', ... }}
      myPlayerId={DEFENDER_ID} ... />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })
})

describe('afb_defender_assign', () => {
  it('renders FleetDisplay interactive for defender with hitsToAssign=barrage_attacker_hits', () => { ... })
  it('shows waiting when isAttacker', () => { ... })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/components/game/SpaceCombatModal.test.jsx
```

- [ ] **Step 3: Add branches to component**

In `src/components/game/SpaceCombatModal.jsx`, add after the existing `barrage` branch:

```jsx
if (combat.phase === 'afb_attacker_assign') {
  return (
    <div className={MODAL_WRAPPER}>
      <div className={PANEL('lg')}>
        <p className="label">Anti-Fighter Barrage — Assign Losses</p>
        <DiceResultsPanel dice={combat.barrage_attacker_dice} hits={combat.barrage_attacker_hits} label="Attacker fired" />
        <DiceResultsPanel dice={combat.barrage_defender_dice} hits={combat.barrage_defender_hits} label="Defender fired" />
        {isAttacker ? (
          <>
            <p className="label">Assign {combat.barrage_defender_hits} hit(s) to your fighters</p>
            <FleetDisplay units={attackerUnits} isInteractive hitsToAssign={combat.barrage_defender_hits}
              validUnitTypes={['fighter']} onConfirm={(casualties) => onAssignHits(casualties)} />
          </>
        ) : (
          <p className="text-muted text-xs">Waiting for attacker to assign losses…</p>
        )}
      </div>
    </div>
  )
}

if (combat.phase === 'afb_defender_assign') {
  return (
    <div className={MODAL_WRAPPER}>
      <div className={PANEL('lg')}>
        <p className="label">Anti-Fighter Barrage — Assign Losses</p>
        <DiceResultsPanel dice={combat.barrage_attacker_dice} hits={combat.barrage_attacker_hits} label="Attacker fired" />
        <DiceResultsPanel dice={combat.barrage_defender_dice} hits={combat.barrage_defender_hits} label="Defender fired" />
        {isDefender ? (
          <>
            <p className="label">Assign {combat.barrage_attacker_hits} hit(s) to your fighters</p>
            <FleetDisplay units={defenderUnits} isInteractive hitsToAssign={combat.barrage_attacker_hits}
              validUnitTypes={['fighter']} onConfirm={(casualties) => onAssignHits(casualties)} />
          </>
        ) : (
          <p className="text-muted text-xs">Waiting for defender to assign losses…</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify passing**

```bash
npx vitest run tests/components/game/SpaceCombatModal.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SpaceCombatModal.jsx tests/components/game/SpaceCombatModal.test.jsx
git commit -m "feat: SpaceCombatModal — add AFB assign branches for attacker and defender"
```

---

## Task 11: `GroundCombatModal` — SCD branches

**Spec:** `component-GroundCombatModal.md`

**Files:**
- Modify: `src/components/game/GroundCombatModal.jsx`
- Modify: `tests/components/game/GroundCombatModal.test.jsx`

- [ ] **Step 1: Write failing tests**

```js
describe('scd_fire phase', () => {
  it('renders Fire Space Cannon button for defender', () => {
    render(<GroundCombatModal combat={{ phase: 'scd_fire', defender_player_id: MY_ID, ... }}
      myPlayerId={MY_ID} onFireScd={mockFn} ... />)
    fireEvent.click(screen.getByText(/fire space cannon/i))
    expect(mockFn).toHaveBeenCalled()
  })
  it('renders waiting message for attacker', () => {
    render(<GroundCombatModal combat={{ phase: 'scd_fire', defender_player_id: 'other' }}
      myPlayerId={MY_ID} ... />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
    expect(screen.queryByText(/fire space cannon/i)).not.toBeInTheDocument()
  })
})

describe('scd_assign phase', () => {
  it('renders DiceResultsPanel and interactive FleetDisplay for attacker', () => {
    render(<GroundCombatModal combat={{ phase: 'scd_assign', attacker_player_id: MY_ID,
      scd_dice: [...], scd_hits: 1, ... }} myPlayerId={MY_ID} onAssignHits={mockFn} ... />)
    expect(screen.getByTestId('dice-results-panel')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-display-attacker')).toHaveAttribute('data-interactive', 'true')
  })
  it('renders waiting for defender on scd_assign', () => {
    render(<GroundCombatModal combat={{ phase: 'scd_assign', attacker_player_id: 'other' }}
      myPlayerId={MY_ID} ... />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify failing**

```bash
npx vitest run tests/components/game/GroundCombatModal.test.jsx
```

- [ ] **Step 3: Add SCD branches to component**

In `src/components/game/GroundCombatModal.jsx`, add before the existing roll/assign section:

```jsx
if (combat.phase === 'scd_fire') {
  return (
    <div className={MODAL_WRAPPER}>
      <div className={PANEL('lg')}>
        <p className="label">Space Cannon Defense — {combat.planet_name}</p>
        {isDefender ? (
          <button className="btn-primary" onClick={onFireScd}>Fire Space Cannon</button>
        ) : (
          <p className="text-muted text-xs">Waiting for defender to fire Space Cannon Defense…</p>
        )}
      </div>
    </div>
  )
}

if (combat.phase === 'scd_assign') {
  return (
    <div className={MODAL_WRAPPER}>
      <div className={PANEL('lg')}>
        <p className="label">Space Cannon Defense — Assign Losses</p>
        <DiceResultsPanel dice={combat.scd_dice} hits={combat.scd_hits} />
        {isAttacker ? (
          <>
            <p className="label">Assign {combat.scd_hits} hit(s) to your ground forces</p>
            <FleetDisplay units={attackerUnits} isInteractive hitsToAssign={combat.scd_hits}
              onConfirm={(casualties) => onAssignHits(casualties)} />
          </>
        ) : (
          <p className="text-muted text-xs">Waiting for attacker to assign losses…</p>
        )}
      </div>
    </div>
  )
}
```

Update prop name from `onAssignGroundHits` → `onAssignHits` throughout the file.

- [ ] **Step 4: Run tests — verify passing**

```bash
npx vitest run tests/components/game/GroundCombatModal.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/GroundCombatModal.jsx tests/components/game/GroundCombatModal.test.jsx
git commit -m "feat: GroundCombatModal — add SCD fire and SCD assign phase branches"
```

---

## Task 12: `GalaxyTab` — Bombardment panel + wiring

**Spec:** `component-GalaxyTab.md`

**Files:**
- Modify: `src/components/game/GalaxyTab.jsx`

- [ ] **Step 1: Wire Phase 14 dispatchers from useCombat**

```js
const {
  // existing...
  rollGroundDice,
  assignHits,        // replaces assignGroundHits
  fireSpaceCannonDefense,
  // new:
  fireBombardment,
  advanceBombardment,
  commitGroundForces,
  bombardmentCombats, // new: array of game_combats with combat_type='bombardment' for active system
} = useCombat(...)
```

Confirm the Realtime subscription in `useGalaxy` or `useCombat` handles `combat_type='bombardment'` rows (INSERT/UPDATE events). The existing subscription on `game_combats` fires for all rows regardless of `combat_type` — no changes needed.

- [ ] **Step 2: Add BombardmentPanel**

In `GalaxyTab.jsx`, add inline `BombardmentPanel` component or extract to `src/components/game/BombardmentPanel.jsx`:

```jsx
function BombardmentPanel({ systemUnits, unitDefs, bombardmentCombatsByPlanet,
    myPlayerId, players, systemKey, onFireBombardment, onAssignHits, onAdvance }) {

  const planets = [...new Set(
    systemUnits.filter(u => u.on_planet && u.player_id !== myPlayerId).map(u => u.on_planet)
  )]

  const allResolved = planets.every(p => {
    const bc = bombardmentCombatsByPlanet.get(p)
    return !bc || bc.phase === 'complete'
  })

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">Bombardment</p>
      {planets.map(planet => {
        const bc = bombardmentCombatsByPlanet.get(planet)
        if (!bc) return (
          <div key={planet} className="flex items-center gap-2">
            <span className="text-muted text-xs">{planet}</span>
            <button className="btn-ghost text-xs" onClick={() => onFireBombardment(systemKey, planet)}>
              Fire Bombardment
            </button>
          </div>
        )
        if (bc.phase === 'bombardment_assign') {
          const isDefender = myPlayerId === bc.defender_player_id
          return (
            <div key={planet}>
              <p className="label">{planet} — {bc.attacker_hits} hit(s)</p>
              <DiceResultsPanel dice={bc.attacker_dice} hits={bc.attacker_hits} />
              {isDefender
                ? <FleetDisplay units={planetUnits(planet, bc.defender_player_id)}
                    isInteractive hitsToAssign={bc.attacker_hits}
                    onConfirm={(c) => onAssignHits(bc.id, c)} />
                : <p className="text-muted text-xs">Waiting for defender to assign losses…</p>
              }
            </div>
          )
        }
        return <p key={planet} className="text-muted text-xs">{planet} — bombardment complete ({bc.attacker_hits} hits)</p>
      })}
      {allResolved && (
        <button className="btn-primary" onClick={() => onAdvance(systemKey)}>
          Done with Bombardment
        </button>
      )}
    </div>
  )
}
```

Wire it into `GalaxyTab` render, shown when `isActivePlayer && !activation?.bombardment_done && (spaceCombatComplete || noSpaceCombat)`.

Update `GroundCombatModal` call to pass `onAssignHits={assignHits}` (renamed from `onAssignGroundHits`) and `onFireScd={fireSpaceCannonDefense}`.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Final deploy and commit**

```bash
cd .. && supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
git add src/components/game/GalaxyTab.jsx src/components/game/BombardmentPanel.jsx
git commit -m "feat: GalaxyTab — bombardment panel, wire Phase 14 combat dispatchers"
```

---

## Final: Update `_index.md`

- [ ] Mark all Phase 14 spec files as `done` in `_index.md` once deployed and tested.
- [ ] Also mark Phase 11 specs (`migration-028`, `fn-game-roll-ground-combat-dice`, `fn-game-commit-ground-forces`, `hook-useCombat`, `component-GroundCombatModal`, `component-GalaxyTab`) as `done`.
- [ ] Commit: `git commit -m "docs: mark Phase 11 and Phase 14 specs complete"`
