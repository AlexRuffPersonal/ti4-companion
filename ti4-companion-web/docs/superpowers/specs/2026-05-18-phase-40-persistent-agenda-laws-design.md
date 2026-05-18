# Phase 39 — Persistent Agenda Law Enforcement

**Date:** 2026-05-18
**Status:** Approved

---

## Overview

TI4 laws (agenda cards with `type = 'law'`) persist round-over-round once enacted. Currently the app tracks active laws in `game_laws` but applies no mechanical enforcement — all non-trivial laws are stored with `host_applies_manually = true`. This phase automates enforcement for the 10 laws with well-defined mechanical effects.

### Rules basis

- **LRR §7.2–7.6** — Laws can permanently change the rules of the game. A law's ability is in effect from enactment until it is discarded (repealed).
- **LRR §7.5** — If a law is discarded from play, that law's ability is no longer in effect.
- **LRR §8.20** — If an "Elect" or "For" outcome of a law was resolved, that card remains in play and permanently affects the game.
- **LRR §98.6** — If a player gains a VP from a law and that law is discarded, that player does not lose that VP.
- **FAQ** — Holy Planet of Ixth, Shard of the Throne, and Crown of Emphidia VP loss occurs only through the effect stated on the card, not on repeal.

---

## Architecture

### Approach

Code-driven shared module keyed by `agendas.name`. No new DB column. Active laws are read from `game_laws JOIN agendas` filtering `is_repealed = false`. This is consistent with `shared-techEffects.ts` and `shared-promissoryEnforcement.ts`.

### New file: `supabase/functions/_shared/lawEffects.ts`

Exports six functions called by affected Edge Functions:

| Export | Signature | Purpose |
|---|---|---|
| `assertProductionAllowed` | `(db, gameId, unitType)` | Throws 409 if an active law blocks producing `unitType` |
| `assertMovementAllowed` | `(db, gameId, planetName)` | Throws 409 if Demilitarized Zone is active for `planetName` |
| `assertFleetCapacity` | `(db, gameId, playerId, requestedFleetSize)` | Throws 409 if Fleet Regulations reduces max below `requestedFleetSize` |
| `assertCombatHitAllowed` | `(db, gameId, unitType)` | Throws 409 if Conventions of War is active and `unitType` is `fighter` |
| `applyStatusPhaseLaws` | `(db, gameId)` | Caps command tokens at 3 per player if Executive Sanctions is active |
| `checkVpMaintenanceLaws` | `(db, gameId, previousOwnerId, lostPlanetName)` | Deducts 1 VP if Holy Planet / Shard / Crown condition is met for `lostPlanetName` |

Internal helper: `getActiveLaws(db, gameId)` — fetches all `game_laws` rows for the game where `is_repealed = false`, joining `agendas` for `name` and `elected_target`.

### New migration: `supabase/migrations/048_law_enforcement.sql`

Adds one performance index and one new column:

```sql
CREATE INDEX IF NOT EXISTS idx_game_laws_game_active
  ON public.game_laws(game_id, is_repealed);

ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS minister_of_war_unlocked BOOLEAN NOT NULL DEFAULT false;
```

`minister_of_war_unlocked` is reset to `false` for all players at the start of each round (in `game-advance-phase` strategy step).

---

## Law Coverage

### Production restrictions — `assertProductionAllowed`

| Law | Logic |
|---|---|
| Regulated Conscription | Block any `unitType` that is not `infantry` |
| Articles of War | Block `unitType = 'pds'` |

### Fleet/movement constraints

| Law | Guard function | Logic |
|---|---|---|
| Fleet Regulations | `assertFleetCapacity` | Reduce the player's fleet pool maximum by 2 (minimum 0); reject move if `requestedFleetSize > max - 2` |
| Demilitarized Zone | `assertMovementAllowed` | Block any unit entering or landing on the planet stored in `elected_target` |

### Combat modifier — `assertCombatHitAllowed`

| Law | Logic |
|---|---|
| Conventions of War | Return error if a hit is being assigned to a unit of type `fighter` |

### Status-phase effects

| Law | Guard function | Logic |
|---|---|---|
| Executive Sanctions | `applyStatusPhaseLaws` | After calculating each player's normal command token gain, cap the total at 3 before writing to DB |
| Holy Planet of Ixth | `checkVpMaintenanceLaws` | Deduct 1 VP from `elected_target` player when they lose control of the planet stored in `elected_target` |
| Shard of the Throne | `checkVpMaintenanceLaws` | Same as Holy Planet — VP loss on losing control of `elected_target` planet |
| Crown of Emphidia | `checkVpMaintenanceLaws` | Same — VP loss on losing control of `elected_target` cultural planet |

VP deduction is guarded: only fires if the player's current VP > 0 and VP was awarded by the law (confirmed via `game_laws.elected_target` matching the losing player's id).

### Player-triggered ability — `use_minister_of_war` DSL op

| Law | Logic |
|---|---|
| Minister of War | New op in `abilityDsl.ts`. The `elected_target` player may exhaust their `elected_target` planet to use the secondary ability of any strategy card currently in play that round. Op validates: caller is elected player, elected planet is not already exhausted. On success: exhausts the planet and sets `game_players.minister_of_war_unlocked = true` for the caller. The existing strategy card secondary flow checks this flag to permit the additional secondary use. Requires `minister_of_war_unlocked BOOLEAN DEFAULT false` column on `game_players` (added in migration 048). |

### Remaining laws

All other laws remain `host_applies_manually = true`. This includes: Mutiny, Galactic Crisis Pact, Incentive Program, Blood Ties, Classified Document Leaks, Political Censure, and all other one-time-resolution or host-adjudicated laws.

---

## Edge Function Changes

| File | Change |
|---|---|
| `supabase/functions/game-produce-units/index.ts` | Call `assertProductionAllowed(db, gameId, unitType)` before each unit is produced; return 409 on throw |
| `supabase/functions/game-move-ships/index.ts` | Call `assertFleetCapacity(db, gameId, playerId, requestedSize)` and `assertMovementAllowed(db, gameId, planetName)` for each destination planet |
| `supabase/functions/game-land-troops/index.ts` | Call `assertMovementAllowed` before landing; call `checkVpMaintenanceLaws(db, gameId, previousOwnerId, planetName)` after planet control changes |
| `supabase/functions/game-assign-hits/index.ts` | Call `assertCombatHitAllowed(db, gameId, unitType)` before assigning; call `checkVpMaintenanceLaws` after any planet control flip |
| `supabase/functions/game-advance-phase/index.ts` | Call `applyStatusPhaseLaws(db, gameId)` during the status-phase command-token distribution step |
| `supabase/functions/_shared/abilityDsl.ts` | Add `repeal_law` op: sets `game_laws.is_repealed = true` for the specified `law_id`, updates `game_agenda_deck.state` to `'repealed'`. Add `use_minister_of_war` op as described above. |

---

## Testing

Unit tests in `ti4-companion-web/tests/lib/lawEffects.test.js`:

- No active laws → all guard functions pass through without error
- Regulated Conscription active → `assertProductionAllowed` blocks `carrier`, passes `infantry`
- Articles of War active → `assertProductionAllowed` blocks `pds`, passes `infantry`
- Fleet Regulations active → `assertFleetCapacity` rejects fleet size exceeding `max - 2`
- Demilitarized Zone active → `assertMovementAllowed` blocks elected planet, passes other planets
- Conventions of War active → `assertCombatHitAllowed` blocks `fighter`, passes `cruiser`
- Executive Sanctions active → `applyStatusPhaseLaws` caps token gain at 3
- Holy Planet / Shard / Crown active → `checkVpMaintenanceLaws` deducts VP when elected planet is lost; no deduction when a different planet is lost
- `repeal_law` DSL op → sets `is_repealed = true`, does **not** deduct VP for Holy Planet / Shard / Crown
- `use_minister_of_war` op → exhausts planet on success; returns error if planet already exhausted or caller is not the elected player
- Multiple active laws → each applies independently (both Regulated Conscription and Articles of War active blocks both `pds` and non-infantry)
