# Phase 13: Anti-Fighter Barrage — Design

## Overview

Anti-Fighter Barrage (AFB) is a pre-combat step that fires between Space Cannon Offense and combat round 1. Units with the `afb` stat (e.g. destroyers, some faction units) fire simultaneously; hits can only be assigned to fighters. The existing `'barrage'` phase value is already in the `game_combats.phase` CHECK constraint. Phase 13 wires up the barrage step end-to-end: schema columns to persist results, two dedicated Edge Functions, a small fix to `game-fire-space-cannon`, and client UI in the space combat modal.

---

## Phase Transition Flow

```
space_cannon → barrage → attacker_roll → ...
```

`game-fire-space-cannon` always transitions to `barrage` when all space cannon entries are resolved (unconditionally — it does not need to know about AFB). The `barrage` phase owns its own logic: fire if AFB units exist, skip if not, then advance to `attacker_roll`.

---

## Schema

**Migration `030_afb.sql`** — four new columns on `game_combats`:

```sql
ALTER TABLE game_combats
  ADD COLUMN barrage_attacker_dice JSONB,
  ADD COLUMN barrage_defender_dice JSONB,
  ADD COLUMN barrage_attacker_hits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN barrage_defender_hits INTEGER NOT NULL DEFAULT 0;
```

No change to the `phase` CHECK constraint — `'barrage'` is already valid.

The null vs. non-null state of `barrage_attacker_dice` distinguishes sub-states within the barrage phase:
- `NULL` → barrage not yet fired (or no AFB units)
- non-null → results stored, waiting for attacker to advance

The `units` table already has an `afb` column; no unit-data migration is needed.

---

## Backend

### `game-fire-space-cannon` (modify)

Remove the `hasDestroyer` function entirely. In the all-resolved branch, replace:
```ts
newPhase = (atkHasDestroyer || defHasDestroyer) ? 'barrage' : 'attacker_roll'
```
with:
```ts
newPhase = 'barrage'
```

The function becomes unaware of AFB. It always hands off to the barrage phase.

---

### `game-fire-anti-fighter-barrage` (new)

Attacker-only. Fires AFB for both sides simultaneously, applies hits to fighters, stores results.

**Guards:**
- `phase === 'barrage'` → 409 otherwise
- `barrage_attacker_dice IS NULL` → 409 "Barrage already fired" if not null
- Caller must be `attacker_player_id` → 409 otherwise

**Logic:**
1. Query all space-area units (`on_planet IS NULL`) for both players in the system.
2. Collect distinct unit types across both sides.
3. Fetch unit defs where `afb IS NOT NULL` for those types.
4. Roll AFB for attacker's units: `parseStat(def.afb)` → roll `dice × count` d10s → hit if `roll >= value`.
5. Roll AFB for defender's units the same way.
6. Apply attacker's hits to defender's fighters only (query `unit_type = 'fighter'`; decrement or delete rows).
7. Apply defender's hits to attacker's fighters the same way.
8. Store: `barrage_attacker_dice`, `barrage_attacker_hits`, `barrage_defender_dice`, `barrage_defender_hits`. Phase stays `'barrage'`.
9. Return `{ barrage_attacker_dice, barrage_attacker_hits, barrage_defender_dice, barrage_defender_hits }`.

---

### `game-advance-barrage` (new)

Attacker-only. Advances phase from `barrage` to `attacker_roll`.

**Guards:**
- `phase === 'barrage'` → 409 otherwise
- Caller must be `attacker_player_id` → 409 otherwise
- If `barrage_attacker_dice IS NULL` AND either side has units with a non-null `afb` stat → 409 "Must fire barrage first"

**Logic:**
- Update `game_combats` → `phase = 'attacker_roll'`
- Return `{ phase: 'attacker_roll' }`

The server-side AFB-unit check in the guard means the client never needs to enforce "fire before advancing" — the server rejects invalid advances regardless of client state.

---

### `game-roll-combat-dice` (modify)

Remove the `barrage` phase block (current lines 101–148). Update `rollPhases` to `['attacker_roll', 'defender_roll']` only. The existing phase guard correctly rejects any call while `phase === 'barrage'`.

---

## Client

### `edgeFunctions.js` (modify)

```js
export const fireAntiFighterBarrage = (gameId, combatId) =>
  callFunction('game-fire-anti-fighter-barrage', { game_id: gameId, combat_id: combatId })

export const advanceBarrage = (gameId, combatId) =>
  callFunction('game-advance-barrage', { game_id: gameId, combat_id: combatId })
```

---

### `useCombat.js` (modify)

Two new dispatchers:
```js
fireAntiFighterBarrage: () => fireAntiFighterBarrageFn(gameId, combat.id),
advanceBarrage: () => advanceBarrageFn(gameId, combat.id),
```

Derive `hasAfbUnits` boolean: join the system's current units (already fetched by the hook) against the units reference table to check whether any unit type on either side has a non-null `afb` stat.

---

### `SpaceCombatModal.jsx` (modify)

Adds a `barrage` phase branch with three sub-states based on combat row data:

**State 1 — Waiting to fire** (`barrage_attacker_dice === null`, `hasAfbUnits === true`):
- Both players: `LABEL("Anti-Fighter Barrage")` + list of AFB-capable units in system
- Attacker: "Fire Anti-Fighter Barrage" button → calls `fireAntiFighterBarrage`
- Defender: waiting message

**State 2 — No AFB units** (`barrage_attacker_dice === null`, `hasAfbUnits === false`):
- Both players: `MUTED("No units capable of Anti-Fighter Barrage")`
- Attacker: "Continue to Combat" button → calls `advanceBarrage`
- Defender: waiting message

**State 3 — Results stored** (`barrage_attacker_dice !== null`):
- Both players: persistent results card — attacker dice + hits, defender dice + hits, fighters destroyed per side
- Attacker: "Continue to Combat" button → calls `advanceBarrage`
- Defender: waiting message

---

## Spec Files (to be created during planning)

| Spec File | Actual File | Status |
|-----------|-------------|--------|
| `migration-030-afb` | `supabase/migrations/030_afb.sql` | planned |
| `fn-game-fire-space-cannon` | `supabase/functions/game-fire-space-cannon/index.ts` | planned |
| `fn-game-roll-combat-dice` | `supabase/functions/game-roll-combat-dice/index.ts` | planned |
| `fn-game-fire-anti-fighter-barrage` | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | planned |
| `fn-game-advance-barrage` | `supabase/functions/game-advance-barrage/index.ts` | planned |
| `client-edgeFunctions` | `src/lib/edgeFunctions.js` | planned |
| `hook-useCombat` | `src/hooks/useCombat.js` | planned |
| `component-SpaceCombatModal` | `src/components/game/SpaceCombatModal.jsx` | planned |
