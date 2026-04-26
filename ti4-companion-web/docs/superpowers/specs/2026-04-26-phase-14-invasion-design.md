# Phase 14 — Full Invasion Design

**Date:** 2026-04-26
**Scope:** Bombardment, Commit Ground Forces, Space Cannon Defense, and the unification of all hit-assignment flows through a single generic `game-assign-hits` function.

---

## Rules Summary

The Invasion step of a tactical action (TI4 LRR §49) proceeds in this order:

1. **Bombardment** — Attacker may fire ships with `bombardment` stat at planets in the system. Each unit is assigned to one planet before rolling. Hits destroy the defender's ground forces on that planet. Planetary Shield blocks bombardment (War Suns ignore Planetary Shield).
2. **Commit Ground Forces** — Attacker lands any ground forces from the space area onto planets of their choice.
3. **Space Cannon Defense** — If a planet being invaded contains units with `space_cannon`, those units fire at the committing ground forces. Hits destroy attacker's ground forces.
4. **Ground Combat** — If both sides have ground forces on a planet, combat rounds proceed (already implemented in Phase 11).
5. **Establish Control** — Already handled by existing `game-assign-ground-hits` end-of-combat logic.

---

## Generic Hit Assignment

All hit-assignment flows (space combat, ground combat, AFB, bombardment, SCD) are unified through the existing `game-assign-hits` function, extended to route on `combat.phase` + `combat.combat_type`.

**Motivation:** Action cards can cancel hits at the assignment window for every hit-generation method, so manual assignment must be available in all cases.

**Auto-advance rule:** If hits = 0 for any assignment phase, the server auto-advances to the next phase without requiring a client call.

### Phase Routing Table

| Phase | `combat_type` | Who assigns | Valid targets | Next phase |
|---|---|---|---|---|
| `afb_attacker_assign` | `space` | attacker | fighters only | `afb_defender_assign` |
| `afb_defender_assign` | `space` | defender | fighters only | `attacker_roll` |
| `bombardment_assign` | `bombardment` | defender of planet | ground forces | `complete` |
| `scd_assign` | `ground` | attacker | ground forces | `attacker_roll` |
| `attacker_assign` | `space` | attacker | ships | `defender_assign` |
| `defender_assign` | `space` | defender | ships | new round or `complete` |
| `attacker_assign` | `ground` | attacker | ground forces | `defender_assign` |
| `defender_assign` | `ground` | defender | ground forces | new round or `complete` |

---

## Data Model Changes (Migration 031)

### `game_combats`

```sql
-- New combat_type value
ALTER TABLE game_combats DROP CONSTRAINT game_combats_combat_type_check;
ALTER TABLE game_combats ADD CONSTRAINT game_combats_combat_type_check
  CHECK (combat_type IN ('space', 'ground', 'bombardment'));

-- New phases
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
  ADD COLUMN scd_dice JSONB,
  ADD COLUMN scd_hits INTEGER NOT NULL DEFAULT 0;
```

### `game_system_activations`

```sql
ALTER TABLE game_system_activations
  ADD COLUMN bombardment_done BOOLEAN NOT NULL DEFAULT false;
```

Bombardment hit state is tracked via `game_combats` rows (`combat_type='bombardment'`). `bombardment_done` is the system-level gate that `game-commit-ground-forces` checks before allowing troops to land.

---

## Bombardment Flow

### `game-fire-bombardment`
- **Actor:** attacker
- **Inputs:** `game_id`, `system_key`, `planet_name`
- **Logic:**
  1. Verify system activated by caller this round
  2. Verify planet exists in tile
  3. Query defender's ground forces on planet — if none, 409 (nothing to bombard)
  4. Check `planetary_shield`: query `game_player_units` on planet for defender; join against `units` table; if any unit has `planetary_shield=true` AND no attacker war sun is in the space area, ERR 409 'Planetary Shield active'
  5. Query attacker's ships in space area (`on_planet IS NULL`) with `bombardment` stat
  6. `ROLL_DICE` using `bombardment` stat
  7. Insert `game_combats` row: `combat_type='bombardment'`, `planet_name`, `attacker_player_id=caller`, `defender_player_id=<planet owner>`, `phase='bombardment_assign'` (or `complete` if hits=0), store dice+hits
- **Returns:** `{ combat_id, dice, hits }`

### `game-assign-hits` (extension — `bombardment_assign`)
- Defender of the planet assigns ground force casualties
- Validates total casualties = `combat.attacker_hits`
- Destroys units; advances `phase` → `complete`

### `game-advance-bombardment`
- **Actor:** attacker
- **Inputs:** `game_id`, `system_key`
- **Logic:** Validates all `game_combats` rows for this `game_id` + `system_key` with `combat_type='bombardment'` are `phase='complete'` OR none exist; if any are still in `bombardment_assign`, ERR 409 'Unresolved bombardment hits'. Sets `bombardment_done=true` on the matching `game_system_activations` row.
- **Returns:** `{ ok: true }`

`game-commit-ground-forces` guards: if any bombardment-capable ships exist in the system space area, require `game_system_activations.bombardment_done=true` before allowing troops to commit.

---

## AFB Changes (Phase 13 Modification)

### `game-fire-anti-fighter-barrage` (modify)
- Remove: auto-destroy fighters via `applyAfbHits`
- After storing dice results, set `phase`:
  - `afb_attacker_assign` if attacker has hits to assign (defHits > 0) — attacker assigns losses to their own fighters
  - `afb_defender_assign` if only defender has hits to assign
  - `attacker_roll` if both hits = 0

### `game-assign-hits` (extension — `afb_attacker_assign`, `afb_defender_assign`)
- `afb_attacker_assign`: attacker assigns their own fighter losses (= `combat.barrage_defender_hits`); valid unit type = fighter only; next → `afb_defender_assign` (or `attacker_roll` if defHits=0)
- `afb_defender_assign`: defender assigns their own fighter losses (= `combat.barrage_attacker_hits`); valid unit type = fighter only; next → `attacker_roll`

---

## Commit Ground Forces

### `game-commit-ground-forces` (renamed from `game-land-troops`)
- Same logic as existing spec; rename only in function name and spec file
- After placing troops, when creating `game_combats` row:
  - Check if defender has units with `space_cannon` stat on the planet
  - If yes: `phase='scd_fire'`
  - If no: `phase='attacker_roll'` (unchanged from Phase 11)

---

## Space Cannon Defense Flow

### `game-fire-space-cannon-defense`
- **Actor:** defender
- **Inputs:** `game_id`, `combat_id`
- **Guards:** combat must be `combat_type='ground'`, `phase='scd_fire'`; caller must be defender
- **Logic:**
  1. Query defender units on planet with `space_cannon` stat
  2. `ROLL_DICE` using `space_cannon` stat
  3. Store `scd_dice`, `scd_hits` on combat row
  4. Advance phase: `scd_assign` if hits > 0, else `attacker_roll`
- **Returns:** `{ scd_dice, scd_hits }`

### `game-assign-hits` (extension — `scd_assign`)
- Attacker assigns their ground force casualties (= `combat.scd_hits`)
- Valid unit types: all ground forces (infantry, mechs, faction variants)
- Destroys units; advances `phase` → `attacker_roll`

---

## Client & UI

### `edgeFunctions.js`
- Rename `landTroops` → `commitGroundForces`
- Add: `fireBombardment`, `advanceBombardment`, `fireSpaceCannonDefense`

### `useCombat.js`
- Add dispatchers for all new functions
- Derive `hasScdUnits` boolean from systemUnits + unitDefs (units on planet with non-null `space_cannon`)

### `GroundCombatModal.jsx`
- Add `scd_fire` branch: defender sees "Fire Space Cannon Defense" button; attacker waits
- Add `scd_assign` branch: attacker assigns hits using existing `FleetDisplay` interactive mode; defender waits

### `SpaceCombatModal.jsx` (Phase 13 mod)
- Add `afb_attacker_assign` branch: attacker assigns fighter losses using `FleetDisplay`
- Add `afb_defender_assign` branch: defender assigns fighter losses using `FleetDisplay`

### `GalaxyTab.jsx`
- Add bombardment panel (pre-commit): shows attacker's bombardment-capable ships; per-planet "Fire Bombardment" and "Skip" buttons; "Advance" button once all planets resolved

---

## Spec Files

| Spec file | Actual file | New/Modify |
|---|---|---|
| `migration-031-invasion` | `supabase/migrations/031_invasion.sql` | New |
| `fn-game-fire-bombardment` | `supabase/functions/game-fire-bombardment/index.ts` | New |
| `fn-game-advance-bombardment` | `supabase/functions/game-advance-bombardment/index.ts` | New |
| `fn-game-commit-ground-forces` | `supabase/functions/game-commit-ground-forces/index.ts` | Rename+Modify |
| `fn-game-fire-space-cannon-defense` | `supabase/functions/game-fire-space-cannon-defense/index.ts` | New |
| `fn-game-assign-hits` | `supabase/functions/game-assign-hits/index.ts` | Modify |
| `fn-game-fire-anti-fighter-barrage` | `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | Modify (Phase 13) |
| `component-SpaceCombatModal` | `src/components/game/SpaceCombatModal.jsx` | Modify (Phase 13) |
| `client-edgeFunctions` | `src/lib/edgeFunctions.js` | Modify |
| `hook-useCombat` | `src/hooks/useCombat.js` | Modify |
| `component-GroundCombatModal` | `src/components/game/GroundCombatModal.jsx` | Modify |
| `component-GalaxyTab` | `src/components/game/GalaxyTab.jsx` | Modify |
