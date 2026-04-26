# Phase 11: Ground Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ground combat — when an attacker lands troops on a planet defended by enemy ground forces, a `game_combats` row (type=ground) is created and both sides roll/assign hits until one is eliminated; the winner controls the planet.

**Architecture:** Extends the existing `game_combats` table with `combat_type` and `planet_name` columns. `game-land-troops` now detects defending ground units and creates a ground combat row instead of immediately claiming the contested planet. Two new Edge Functions (`game-roll-ground-combat-dice`, `game-assign-ground-hits`) handle the combat loop. The existing `useCombat` hook and `useGalaxy` Realtime subscription require minimal changes; `GalaxyTab` routes to a new `GroundCombatModal` when `activeCombat.combat_type === 'ground'`.

**Tech Stack:** Deno/TypeScript Edge Functions, Supabase PostgreSQL + Realtime, React 19, Vitest, @testing-library/react

---

## File Map

| File | New/Modify | Responsibility |
|------|-----------|----------------|
| `supabase/migrations/028_ground_combat.sql` | New | Add `combat_type` + `planet_name` columns to `game_combats` |
| `supabase/functions/game-land-troops/index.ts` | Modify | Detect defenders before claiming; spawn ground combat if defenders present |
| `supabase/functions/game-roll-ground-combat-dice/index.ts` | New | Roll combat dice for units on a specific planet |
| `supabase/functions/game-assign-ground-hits/index.ts` | New | Apply casualties to planet units; claim planet on attacker win |
| `ti4-companion-web/src/lib/edgeFunctions.js` | Modify | Add `rollGroundCombatDice`, `assignGroundHits` wrappers |
| `ti4-companion-web/src/hooks/useCombat.js` | Modify | Expose `rollGroundDice`, `assignGroundHits` dispatchers |
| `ti4-companion-web/src/components/game/GroundCombatModal.jsx` | New | Ground combat UI — roll/assign panel for planet units, no retreat |
| `ti4-companion-web/src/components/game/GalaxyTab.jsx` | Modify | Route to `GroundCombatModal` when `activeCombat.combat_type === 'ground'` |
| `ti4-companion-web/tests/functions/game-land-troops.test.js` | Modify | Add ground combat trigger scenarios |
| `ti4-companion-web/tests/functions/game-roll-ground-combat-dice.test.js` | New | Unit tests for new roll function |
| `ti4-companion-web/tests/functions/game-assign-ground-hits.test.js` | New | Unit tests for new assign function |
| `ti4-companion-web/tests/components/game/GroundCombatModal.test.jsx` | New | Component tests for new modal |

---

## Task 1: DB Migration — extend `game_combats`

**Files:**
- Create: `supabase/migrations/028_ground_combat.sql`

**Migration SQL:**

```sql
ALTER TABLE game_combats
  ADD COLUMN combat_type TEXT NOT NULL DEFAULT 'space',
  ADD COLUMN planet_name TEXT NULL;

COMMENT ON COLUMN game_combats.combat_type IS 'space or ground';
COMMENT ON COLUMN game_combats.planet_name IS 'populated for ground combat only';
```

- [ ] **Step 1:** Create the migration file with the SQL above.

- [ ] **Step 2:** Apply locally.

```bash
supabase db push
```

Expected: migration applies without error.

- [ ] **Step 3:** Commit.

```bash
git add supabase/migrations/028_ground_combat.sql
git commit -m "feat: add combat_type and planet_name columns to game_combats (Phase 11)"
```

---

## Task 2: Modify `game-land-troops` — spawn ground combat on contested landing

**Files:**
- Modify: `supabase/functions/game-land-troops/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-land-troops.test.js`

**Behaviour contract:**

Before the existing planet upsert, query `game_player_units` for enemy ground units on the target planet:

```typescript
// Pseudocode — detect defenders
const { data: defenders } = await db
  .from('game_player_units')
  .select('id, player_id')
  .eq('game_id', body.game_id)
  .eq('system_key', body.system_key)
  .eq('on_planet', body.planet_name)
  .neq('player_id', player.id)
```

**If defenders exist:**
1. Insert attacker's infantry with `on_planet = planet_name` (same as before — units are on the planet).
2. Do NOT upsert into `game_player_planets` (planet is still contested).
3. Do NOT apply Custodians logic yet.
4. Insert a `game_combats` row:
   ```typescript
   {
     game_id: body.game_id,
     system_key: body.system_key,
     attacker_player_id: player.id,
     defender_player_id: defenders[0].player_id,
     phase: 'attacker_roll',
     combat_type: 'ground',
     planet_name: body.planet_name,
   }
   ```
5. Return `{ combat_id: <new row id> }`.

**If no defenders (unchanged path):** existing logic — upsert planet, insert/update units, handle Custodians.

**Response shape:**
- Uncontested: `{ claimed: true, custodians_claimed?: true }` (unchanged)
- Contested: `{ combat_id: string }`

**New test scenarios to add to `game-land-troops.test.js`:**

```javascript
// In mockDb, add support for:
// - defenderUnits: array of { id, player_id } returned for enemy unit query
// - combatInsertMock: vi.fn() returned for game_combats.insert()

describe('game-land-troops — contested planet', () => {
  it('creates a ground combat and returns combat_id when defenders are present')
  it('does NOT upsert game_player_planets when defenders are present')
  it('inserts attacker infantry on the planet even when contested')
  it('uses the first defender player_id as defender_player_id in combat row')
  it('does NOT award Custodians when landing triggers ground combat')
  it('still returns { claimed: true } when landing on undefended planet (regression)')
})
```

- [ ] **Step 1:** Write the new failing tests (add to existing file — mock `game_combats` table support in `mockDb`).

- [ ] **Step 2:** Run tests to confirm new tests fail.

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-land-troops.test.js
```

Expected: new tests FAIL, existing tests still PASS.

- [ ] **Step 3:** Update `game-land-troops/index.ts` — add defender query and branch logic before planet upsert.

- [ ] **Step 4:** Run all tests.

```bash
npx vitest run tests/functions/game-land-troops.test.js
```

Expected: all tests PASS.

- [ ] **Step 5:** Commit.

```bash
git add supabase/functions/game-land-troops/index.ts \
        ti4-companion-web/tests/functions/game-land-troops.test.js
git commit -m "feat: spawn ground combat when landing on contested planet (Phase 11)"
```

---

## Task 3: New Edge Function — `game-roll-ground-combat-dice`

**Files:**
- Create: `supabase/functions/game-roll-ground-combat-dice/index.ts`
- Create: `ti4-companion-web/tests/functions/game-roll-ground-combat-dice.test.js`

**Request body:**
```typescript
{ game_id: string; combat_id: string }
```

**Behaviour contract:**

1. Authenticate caller. Reject if player not in game.
2. Fetch `game_combats` row. Reject if `combat_type !== 'ground'`.
3. Valid phases: `attacker_roll`, `defender_roll` only (no barrage for ground combat).
4. Enforce turn — attacker must roll `attacker_roll`, defender must roll `defender_roll`.
5. Fetch rolling player's units filtered by `on_planet = combat.planet_name` AND `system_key = combat.system_key`.
6. Load `units` definitions for those unit types, use `combat` stat column only.
7. Roll dice using the same `parseStat` / `rollDice` helpers as `game-roll-combat-dice` (copy the helper functions — they are not shared via import).
8. Update `game_combats`:
   - `attacker_roll` → set `attacker_dice`, `attacker_hits`, phase = `defender_assign`
   - `defender_roll` → set `defender_dice`, `defender_hits`, phase = `attacker_assign`
9. Return `{ phase: nextPhase, dice: DieResult[], hits: number }`.

**Types (copy from `game-roll-combat-dice`):**
```typescript
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }
type UnitDef = { name: string; combat: string | null; sustain_damage: boolean }
type DieResult = { unit_type: string; roll: number; hit: boolean }
```

**Test scenarios:**

```javascript
describe('game-roll-ground-combat-dice', () => {
  it('returns 401 for unauthenticated request')
  it('returns 400 if game_id missing')
  it('returns 400 if combat_id missing')
  it('returns 404 if player not in game')
  it('returns 404 if combat not found')
  it('returns 409 if combat_type is not ground')
  it('returns 409 if combat phase is space_cannon (invalid for ground)')
  it('returns 409 if attacker tries to roll on defender_roll phase')
  it('returns 409 if defender tries to roll on attacker_roll phase')
  it('fetches only units on the correct planet (on_planet filter)')
  it('sets attacker_dice, attacker_hits and phase=defender_assign on attacker_roll')
  it('sets defender_dice, defender_hits and phase=attacker_assign on defender_roll')
  it('handles CORS preflight')
})
```

Follow the same mock pattern as `game-land-troops.test.js` — mock `auth.ts` and `db.ts`, call `handler` directly.

- [ ] **Step 1:** Write all failing tests.

- [ ] **Step 2:** Run to confirm all fail.

```bash
npx vitest run tests/functions/game-roll-ground-combat-dice.test.js
```

- [ ] **Step 3:** Implement `game-roll-ground-combat-dice/index.ts`.

- [ ] **Step 4:** Run tests.

```bash
npx vitest run tests/functions/game-roll-ground-combat-dice.test.js
```

Expected: all PASS.

- [ ] **Step 5:** Commit.

```bash
git add supabase/functions/game-roll-ground-combat-dice/ \
        ti4-companion-web/tests/functions/game-roll-ground-combat-dice.test.js
git commit -m "feat: add game-roll-ground-combat-dice Edge Function (Phase 11)"
```

---

## Task 4: New Edge Function — `game-assign-ground-hits`

**Files:**
- Create: `supabase/functions/game-assign-ground-hits/index.ts`
- Create: `ti4-companion-web/tests/functions/game-assign-ground-hits.test.js`

**Request body:**
```typescript
{ game_id: string; combat_id: string; casualties: Casualty[] }
// Casualty = { unit_type: string; player_unit_id: string; action: 'destroy' | 'sustain' }
```

**Behaviour contract:**

1. Authenticate caller. Reject if player not in game.
2. Fetch combat row. Reject if `combat_type !== 'ground'`.
3. Valid phases: `defender_assign`, `attacker_assign`.
4. Determine `assigneeId` and `hitsToAssign` — same logic as `game-assign-hits`:
   - `defender_assign` → defender assigns, hits = `combat.attacker_hits`
   - `attacker_assign` → attacker assigns, hits = `combat.defender_hits`
5. Verify caller is the assignee.
6. Validate `casualties.length === hitsToAssign`.
7. Fetch assignee's units filtered by `on_planet = combat.planet_name` AND `system_key = combat.system_key`.
8. Load sustain_damage definitions. Validate sustain candidates.
9. Apply casualties — same destroy/sustain logic as `game-assign-hits`.
10. **After `defender_assign`:** advance phase to `defender_roll`. Return `{ phase: 'defender_roll' }`.
11. **After `attacker_assign`:** check end-of-round:
    a. Count attacker's and defender's remaining units on the planet.
    b. **If both have units:** start next round — reset dice/hits, set `phase = 'attacker_roll'`, increment `round`.
    c. **If defender has 0 units (attacker wins):**
       - Upsert into `game_player_planets`: `{ game_id, player_id: attacker_id, planet_name, tile_id, exhausted: true }` with `onConflict: 'game_id,planet_name'`.
       - Remove the defender's `game_player_planets` row for this planet (delete where `game_id`, `planet_name`, `player_id = defender_id`).
       - If `combat.system_key === '0,0'` and `custodians_claimed === false`: award 1 VP + set `custodians_claimed=true`, `agenda_unlocked=true` (same logic as `game-land-troops` currently does).
       - Set `status = 'complete'`, `winner_player_id = attacker_id`.
       - Return `{ status: 'complete', winner_player_id: attacker_id }`.
    d. **If attacker has 0 units (defender wins):**
       - No planet ownership change.
       - Set `status = 'complete'`, `winner_player_id = defender_id`.
       - Return `{ status: 'complete', winner_player_id: defender_id }`.

**Key difference from `game-assign-hits`:** No retreat logic. No `retreat_declared_by` check.

**Test scenarios:**

```javascript
describe('game-assign-ground-hits', () => {
  it('returns 401 for unauthenticated request')
  it('returns 400 if game_id missing')
  it('returns 400 if combat_id missing')
  it('returns 400 if casualties is not an array')
  it('returns 404 if player not in game')
  it('returns 404 if combat not found')
  it('returns 409 if combat_type is not ground')
  it('returns 409 if combat phase is attacker_roll (not an assign phase)')
  it('returns 409 if caller is not the assignee')
  it('returns 409 if casualties.length does not equal hitsToAssign')
  it('returns 409 if sustaining a unit type without sustain_damage')
  it('returns 409 if sustaining an already-damaged unit')
  it('advances to defender_roll after defender_assign')
  it('destroys units in game_player_units (reduces count or deletes row)')
  it('marks unit as damaged=true on sustain action')
  it('starts next round when both sides have units remaining after attacker_assign')
  it('claims planet for attacker when defender has 0 units')
  it('deletes defender planet row when attacker wins')
  it('awards Custodians VP when attacker wins on Mecatol Rex and custodians not yet claimed')
  it('does NOT award Custodians when custodians already claimed')
  it('marks defender as winner with no planet change when attacker has 0 units')
  it('handles CORS preflight')
})
```

- [ ] **Step 1:** Write all failing tests.

- [ ] **Step 2:** Run to confirm all fail.

```bash
npx vitest run tests/functions/game-assign-ground-hits.test.js
```

- [ ] **Step 3:** Implement `game-assign-ground-hits/index.ts`.

- [ ] **Step 4:** Run tests.

```bash
npx vitest run tests/functions/game-assign-ground-hits.test.js
```

Expected: all PASS.

- [ ] **Step 5:** Run the full suite to check for regressions.

```bash
npm test
```

Expected: all tests PASS (count increases by ~20+).

- [ ] **Step 6:** Commit.

```bash
git add supabase/functions/game-assign-ground-hits/ \
        ti4-companion-web/tests/functions/game-assign-ground-hits.test.js
git commit -m "feat: add game-assign-ground-hits Edge Function (Phase 11)"
```

---

## Task 5: Client wrappers — `edgeFunctions.js` + `useCombat.js`

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Modify: `ti4-companion-web/src/hooks/useCombat.js`

**`edgeFunctions.js` additions:**

Add after the existing combat exports (currently around line 141–153):

```javascript
export const rollGroundCombatDice = (gameId, combatId) =>
  callFunction('game-roll-ground-combat-dice', { game_id: gameId, combat_id: combatId })

export const assignGroundHits = (gameId, combatId, casualties) =>
  callFunction('game-assign-ground-hits', { game_id: gameId, combat_id: combatId, casualties })
```

**`useCombat.js` additions:**

Import the two new functions at the top alongside the existing imports. Add them to the returned object:

```javascript
// New import
import {
  // ...existing...
  rollGroundCombatDice as rollGroundCombatDiceFn,
  assignGroundHits as assignGroundHitsFn,
} from '../lib/edgeFunctions.js'

// In the returned object:
return {
  combat,
  fireSpaceCannon: (pass) => fireSpaceCannonFn(gameId, combatId, pass),
  rollDice: () => rollCombatDiceFn(gameId, combatId),
  assignHits: (casualties) => assignHitsFn(gameId, combatId, casualties),
  declareRetreat: (destination) => declareRetreatFn(gameId, combatId, destination),
  rollGroundDice: () => rollGroundCombatDiceFn(gameId, combatId),         // NEW
  assignGroundHits: (casualties) => assignGroundHitsFn(gameId, combatId, casualties), // NEW
}
```

No new test file needed for these wrappers — they are covered by integration tests through the modal.

- [ ] **Step 1:** Add the two exports to `edgeFunctions.js`.

- [ ] **Step 2:** Update `useCombat.js` — add imports and return properties.

- [ ] **Step 3:** Run full suite to confirm no regressions.

```bash
npm test
```

- [ ] **Step 4:** Commit.

```bash
git add ti4-companion-web/src/lib/edgeFunctions.js \
        ti4-companion-web/src/hooks/useCombat.js
git commit -m "feat: add rollGroundDice and assignGroundHits client wrappers (Phase 11)"
```

---

## Task 6: New component — `GroundCombatModal`

**Files:**
- Create: `ti4-companion-web/src/components/game/GroundCombatModal.jsx`
- Create: `ti4-companion-web/tests/components/game/GroundCombatModal.test.jsx`

**Props:**
```javascript
GroundCombatModal({
  combat,           // game_combats row (combat_type === 'ground')
  myPlayerId,       // string — current user's player_id
  players,          // array of { id, display_name }
  systemUnits,      // all game_player_units for this game
  unitDefs,         // Map<unit_type, { sustain_damage: boolean }> — optional, loaded internally if not provided
  onRollGroundDice, // () => Promise<void>
  onAssignGroundHits, // (casualties) => Promise<void>
  onClose,          // () => void
})
```

**Behaviour contract:**

- Loads `unitDefs` from `supabase.from('units').select('name, sustain_damage')` on mount (same as `CombatModal`).
- Filters `systemUnits` to units where `system_key === combat.system_key` AND `on_planet === combat.planet_name`.
- Derives `attackerUnits` and `defenderUnits` from filtered units.
- `isAttacker = myPlayerId === combat.attacker_player_id`, `isDefender = myPlayerId === combat.defender_player_id`.
- Roll phase logic (same as `CombatModal`): `attacker_roll` → attacker rolls; `defender_roll` → defender rolls. Single "Roll Dice" button calling `onRollGroundDice`.
- Assign phase: uses `FleetDisplay` with `isInteractive` and `hitsToAssign` (same as `CombatModal`). Calls `onAssignGroundHits`.
- **No retreat picker** — ground combat has no retreat.
- Header shows: `"GROUND COMBAT — {combat.planet_name}"` and `"ROUND {combat.round}"`.
- Completed screen: same result screen as `CombatModal` — winner name + "Close" button.
- Waiting message when it's not the caller's turn to act.

**Reuses:** `FleetDisplay`, `DiceResultsPanel` (already exist).

**Test scenarios:**

```javascript
describe('GroundCombatModal', () => {
  it('renders nothing when combat is null')
  it('renders planet name in header')
  it('shows Roll Dice button for attacker on attacker_roll phase')
  it('shows Roll Dice button for defender on defender_roll phase')
  it('does NOT show Roll Dice for wrong player')
  it('shows FleetDisplay for attacker in attacker_assign phase')
  it('shows FleetDisplay for defender in defender_assign phase')
  it('does NOT render a retreat picker')
  it('shows waiting message when it is not caller\'s turn')
  it('shows completed result screen with winner name when status is complete')
  it('calls onClose when Close button is clicked on result screen')
  it('calls onRollGroundDice when Roll Dice is clicked')
})
```

For unit tests: mock `supabase` so the `units` query resolves immediately. Mock `FleetDisplay` and `DiceResultsPanel` as simple divs to keep tests focused on modal logic.

- [ ] **Step 1:** Write all failing tests.

- [ ] **Step 2:** Run to confirm all fail.

```bash
npx vitest run tests/components/game/GroundCombatModal.test.jsx
```

- [ ] **Step 3:** Implement `GroundCombatModal.jsx`.

- [ ] **Step 4:** Run tests.

```bash
npx vitest run tests/components/game/GroundCombatModal.test.jsx
```

Expected: all PASS.

- [ ] **Step 5:** Commit.

```bash
git add ti4-companion-web/src/components/game/GroundCombatModal.jsx \
        ti4-companion-web/tests/components/game/GroundCombatModal.test.jsx
git commit -m "feat: add GroundCombatModal component (Phase 11)"
```

---

## Task 7: Wire `GalaxyTab` + deploy

**Files:**
- Modify: `ti4-companion-web/src/components/game/GalaxyTab.jsx`

**Changes to `GalaxyTab.jsx`:**

1. Import `GroundCombatModal`.
2. Derive `combatType` from `activeCombat?.combat_type`.
3. Update existing condition variables:
   ```javascript
   const spaceCombatActive = combatActive && combat?.combat_type === 'space'
   const groundCombatActive = combatActive && combat?.combat_type === 'ground'

   const showSpaceCannon = spaceCombatActive && combat.phase === 'space_cannon'
   const showSpaceCombat = (spaceCombatActive && combat.phase !== 'space_cannon') || completedCombat?.combat_type === 'space'
   const showGroundCombat = groundCombatActive || completedCombat?.combat_type === 'ground'
   const displayCombat = completedCombat ?? combat
   ```
4. Add `GroundCombatModal` below `CombatModal`:
   ```jsx
   {showGroundCombat && (
     <GroundCombatModal
       combat={displayCombat}
       myPlayerId={myPlayerId}
       players={players}
       systemUnits={systemUnits}
       onRollGroundDice={rollGroundDice}
       onAssignGroundHits={assignGroundHits}
       onClose={() => setCompletedCombat(null)}
     />
   )}
   ```
5. Destructure `rollGroundDice` and `assignGroundHits` from `useCombat`.

No new test file for `GalaxyTab` — existing `GalaxyTab` tests should still pass; add a smoke test for the ground combat branch if an existing `GalaxyTab.test.jsx` exists.

- [ ] **Step 1:** Update `GalaxyTab.jsx` with the changes above.

- [ ] **Step 2:** Run full test suite.

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3:** Commit.

```bash
git add ti4-companion-web/src/components/game/GalaxyTab.jsx
git commit -m "feat: wire GroundCombatModal into GalaxyTab (Phase 11)"
```

- [ ] **Step 4:** Deploy all three Edge Functions.

```bash
supabase functions deploy game-land-troops --no-verify-jwt
supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
supabase functions deploy game-assign-ground-hits --no-verify-jwt
```

- [ ] **Step 5:** Apply migration to production.

```bash
supabase db push
```

- [ ] **Step 6:** Final regression check.

```bash
npm test
```

- [ ] **Step 7:** Commit deploy marker.

```bash
git commit --allow-empty -m "chore: deploy Phase 11 ground combat Edge Functions"
```

---

## Self-Review

### Spec coverage
- [x] Migration adds `combat_type` + `planet_name` — Task 1
- [x] `game-land-troops` detects defenders, creates ground combat — Task 2
- [x] `game-roll-ground-combat-dice` rolls for planet units — Task 3
- [x] `game-assign-ground-hits` applies casualties, claims planet on win — Task 4
- [x] Custodians awarded on ground combat win at Mecatol Rex — Task 4
- [x] Client wrappers — Task 5
- [x] `GroundCombatModal` UI — Task 6
- [x] `GalaxyTab` routing — Task 7
- [x] Deploy — Task 7

### Out of scope (deferred)
- Bombardment before landing (no ships with `bombardment` stat trigger yet)
- Planetary Shield faction ability (blocks bombardment)
- Mech special abilities (mechs can sustain in ground combat — `sustain_damage` stat handles this automatically via `FleetDisplay` chip cycling, no special code needed)
- Wormhole-connected bombardment
