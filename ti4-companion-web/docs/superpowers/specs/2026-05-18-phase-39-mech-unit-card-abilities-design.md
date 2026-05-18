# Phase 39: Mech Unit Card Abilities — Design

**Date:** 2026-05-18
**Scope:** All factions (base game + Prophecy of Kings), full DSL enforcement

---

## Rules Basis

- **LRR §55 (Mechs):** Mechs are faction-specific heavy ground forces. Each faction begins with their mech unit card in play on their leader sheet and can produce mechs for the cost on the card. Some mechs have "Deploy" abilities allowing placement without normal production. Mech unit cards are **not** technologies.
- **LRR §30 (Deploy):** Deploy abilities are optional and player-initiated. Conditions vary by faction (start of ground combat, after tech research, after retreat, etc.).
- **LRR §42 (Ground Combat):** Mech round-of-combat abilities fire at the "start of a round of ground combat" timing window.

---

## Context

Phase 16 added the `mech` unit type, the `units.faction` column, and the `LeaderCard` / `LeaderPanel` UI. The `useLeaders` hook already fetches the player's faction mech from `units WHERE unit_type='mech' AND faction=playerFaction`. `LeaderCard` already renders `leader.ability_text || leader.text` — but neither column exists on `units` today, so mech cards show no ability text. This phase fills that gap and adds full DSL enforcement.

---

## Architecture

Approach A: extend `units` table. No new tables.

- `units` gains `ability_text TEXT`, `effects JSONB DEFAULT '[]'`, `deploy_trigger TEXT`
- `admin-import-units` passes through the new fields
- `game-resolve-ability` gains a `source_type='mech'` branch reading effects directly from the `units` row
- New edge function `game-deploy-mech` handles Deploy-type abilities
- One new DSL op: `exhaust_planet`
- `LeaderCard` gains conditional Deploy / USE ABILITY buttons

---

## Section 1: Data Model

### Migration 048

Migration 046 is taken by Phase 36 (objective conditions) and 047 by Phase 37 (strategy card effects).

```sql
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS ability_text  TEXT,
  ADD COLUMN IF NOT EXISTS effects       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deploy_trigger TEXT;
```

**Column semantics:**

| Column | Type | Used by |
|---|---|---|
| `ability_text` | `TEXT` | Card text displayed in `LeaderCard`; null for generic units |
| `effects` | `JSONB DEFAULT '[]'` | DSL ops array (same format as `ability_definitions.effects`); empty for generic units and passive-only mechs |
| `deploy_trigger` | `TEXT` | Enum: `'ground_combat_start' \| 'after_tech_research' \| 'after_retreat' \| 'after_produce' \| 'after_exploration'`; null for non-deploy mechs and generic units |

`LeaderCard` checks `leader.ability_text` first (new column name) falling back to `leader.text` — this is already how it is coded today (`leader.ability_text || leader.text`), so no change needed to that line.

### `admin-import-units` changes

The existing spread `{ ...r }` on each record already passes new fields through to the insert. Three changes:
1. Add `ability_text`, `effects`, `deploy_trigger` to `importSchemas.js` schema entry for `units`
2. Default `effects: r.effects ?? []` in the row mapping (joins the existing `sustain_damage` and `planetary_shield` defaulting)
3. No new import function; no new admin table

---

## Section 2: Backend — Ability Execution & Deploy

### `game-resolve-ability` — `source_type='mech'` branch

```pseudocode
IF source_type === 'mech':
  fetch units row WHERE id = source_id
  ERR 409 if not found or unit_type !== 'mech'
  ERR 409 if units.faction !== activatingPlayer.faction
  interpretEffects(units.effects, context, db)
  log game event (source: 'mech', source_id)
```

No `ability_sources` lookup — effects live directly on the `units` row.

### New edge function: `game-deploy-mech`

```
POST { gameId, unitId, targetPlanetName, replacingInfantry?: boolean }
```

1. Auth — activating player only
2. Fetch `units` row by `unitId`; verify `unit_type='mech'` and `faction === player.faction`
3. Verify `targetPlanetName` is controlled by the activating player
4. Execute `place_units { unit_type:'mech', count:1, on_planet:targetPlanetName }`
5. If `replacingInfantry=true`: execute `destroy_units { unit_type:'infantry', count:1, on_planet:targetPlanetName }`
6. Log game event

### New DSL op: `exhaust_planet`

```typescript
case 'exhaust_planet':
  // selections.planet_name required
  planetName = context.selections.planet_name
  fetch game_player_planets WHERE game_id + player_id + planet_name = planetName
  ERR 409 'Planet not found or not controlled' if not found
  ERR 409 'Planet already exhausted' if row.exhausted
  update game_player_planets SET exhausted = true WHERE id = row.id
```

Used by Nekro Virus mech: `[{ op:'exhaust_planet' }, { op:'modify_roll', modifier:2 }]`

### Effect patterns for all 24 faction mechs

All mech abilities map to existing DSL ops plus the single new `exhaust_planet` op:

| Pattern | Effect sequence |
|---|---|
| Spend N TG → +2 combat | `spend_trade_goods(N)` → `modify_roll(+2)` |
| Spend strategy token → +2 | `spend_strategy_token` → `modify_roll(+2)` |
| Exhaust planet → +2 combat | `exhaust_planet` → `modify_roll(+2)` |
| Choice: +1 combat OR cancel hit | `choice([ [modify_roll(+1)], [cancel_hit] ])` |
| After sustain: ready planet | `ready_planets(1)` |
| Produce N infantry on planet | `place_units(infantry, N, planet_name)` |
| Draw action card | `draw_action_card` |
| Research tech → deploy | `game-deploy-mech` (client-side; no effect in resolve-ability) |

**Passive effects** stored as `effects: []` (card text displayed, no automation):
- Ghosts of Creuss — wormhole blocking while mech present
- Yssaril Tribes — use faction abilities during ground combat
- Any PoK mech passive too complex to model in DSL

**Naaz-Rokha "replace on destroy"** — `game-assign-hits` extended: after decrementing a mech to 0, check if `units.effects` contains an `on_destroy` key (top-level key alongside the normal effects array, e.g. `{ "on_destroy": [{ "op": "place_units", ... }] }`); if so, include a `post_destroy_mech_effect` field in the response. Client shows a confirmation prompt → calls `game-resolve-ability (source_type='mech')`. The effect sequence: `place_units(infantry, 2, on_planet)`.

---

## Section 3: Frontend

### `edgeFunctions.js`

Two new wrappers:
```javascript
deployMech(gameId, unitId, targetPlanetName, replacingInfantry)
  → callFunction('game-deploy-mech', { gameId, unitId, targetPlanetName, replacingInfantry })

resolveMechAbility(gameId, unitId, selections)
  → callFunction('game-resolve-ability', { gameId, sourceType:'mech', sourceId:unitId, selections })
```

### `useLeaders.js`

- Expose `deployMech` and `resolveMechAbility` wrappers
- Add `mechIsOnBoard: boolean` — queries `game_player_units WHERE unit_type='mech'` for the current player, sums `count` across all rows, checks total ≥ 2 (max mech plastic per faction)

### `LeaderCard.jsx`

Mech card gains conditional action buttons (replaces the current `actionButton = null` for `isMech`):

```pseudocode
if isMech:
  if factionMech.deploy_trigger:
    show btn-ghost "DEPLOY" → opens PlanetPickerModal
    replacingInfantry = (deploy_trigger === 'ground_combat_start')
  if factionMech.effects.length > 0:
    show btn-primary "USE ABILITY" → resolveMechAbility(factionMech.id, selections)
  // passive-only mechs: no button; card text explains the passive
```

**PlanetPickerModal** — reuses `SelectionModal` (same planet-selection pattern used by `ready_planets` in strategy card secondary). Lists player-controlled planets; on confirm calls `deployMech`.

Ground-combat-round abilities (L1Z1X, Barony, Nekro, Mentak) are activated from the persistent `LeaderCard` in `MyPanelSection` — consistent with how leader abilities work today. No changes to `GroundCombatModal`.

### Files modified

| File | Change |
|---|---|
| `supabase/migrations/048_mech_abilities.sql` | New — adds 3 columns to `units` |
| `supabase/functions/game-deploy-mech/index.ts` | New |
| `supabase/functions/game-resolve-ability/index.ts` | Add `source_type='mech'` branch |
| `supabase/functions/_shared/abilityDsl.ts` | Add `exhaust_planet` op |
| `supabase/functions/game-assign-hits/index.ts` | Add `post_destroy_mech_effect` for Naaz-Rokha |
| `src/lib/edgeFunctions.js` | Add `deployMech`, `resolveMechAbility` |
| `src/hooks/useLeaders.js` | Add wrappers + `mechIsOnBoard` |
| `src/components/game/LeaderCard.jsx` | Mech buttons + PlanetPickerModal |
| `src/lib/importSchemas.js` | Add 3 fields to `units` entry |
| `admin-import-units/index.ts` | Default `effects: r.effects ?? []` |

---

## Testing

- Migration smoke test: run full test suite after applying 048
- `game-deploy-mech`: auth check, faction mismatch → 409, planet not owned → 409, success path places mech + (optionally) removes infantry
- `game-resolve-ability (source_type='mech')`: faction mismatch → 409, executes effects, `exhaust_planet` op unit tested
- `game-assign-hits` Naaz-Rokha path: destroying mech returns `post_destroy_mech_effect` flag
- `LeaderCard` render: mech with deploy_trigger shows DEPLOY btn; mech with effects shows USE ABILITY; passive mech shows neither
