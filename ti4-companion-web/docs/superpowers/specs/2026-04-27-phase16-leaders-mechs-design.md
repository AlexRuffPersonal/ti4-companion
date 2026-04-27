# Phase 16 Design: Leaders & Mechs

**Date:** 2026-04-27
**Phase:** 16
**Feature area:** Leaders (Agent / Commander / Hero) + Mech unit tracking

---

## Rules basis

- **LRR §50** — Leader Sheet: each player has slots for agent, commander, hero, and mech card.
- **LRR §51.3–51.4** — Agents start ready (unlocked), exhaust on use, ready during Status Phase "Ready Cards" step.
- **LRR §51.5–51.8** — Commanders start locked, unlock by faction-specific condition, cannot be exhausted, cannot re-lock. Shareable via Alliance promissory note.
- **LRR §51.9–51.12** — Heroes start locked, unlock at 3 scored objectives, cannot be exhausted, purged after use. Exception: Titans of Ul hero attaches to Elysium instead of being purged.
- **LRR §51.7** — A commander cannot be exhausted.
- **LRR §55** — Mechs are faction-specific ground forces; produced at cost shown on card; some have Deploy abilities; mech cards are NOT technologies.
- **LRR §30** — Deploy: no resource cost unless stated; unit must be in reinforcements; once per timing window.
- **LRR §34** — Exhausted cards cannot activate abilities; passive abilities still apply while exhausted.
- **LRR §70** — Purge permanently removes a component from the game.

---

## Approach

**Approach B — Handler framework + phased DSL coverage.** Build the full infrastructure (reference table, admin import, state tracking, status phase readying, mech production guard) and wire leader abilities through the existing ability system. Expand the DSL with ops that are now unblocked. Complex interactions that depend on future systems (unit movement, combat-time hooks, Deploy placement) are stubbed as no-op handlers with entries in `POTENTIAL_TODOS.md`.

---

## Data Layer

### Migration 033

**New table: `leaders`**
```sql
CREATE TABLE public.leaders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  leader_type   TEXT NOT NULL CHECK (leader_type IN ('agent', 'commander', 'hero')),
  faction       TEXT NOT NULL,
  text          TEXT,
  unlock_criteria TEXT
);
```
This table is what `game-unlock-commander` already references; creating it unblocks that function.

**Modified table: `units`**
```sql
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS faction TEXT;
```
Nullable — only mech rows have a faction value. Generic units leave it null. Allows `game-produce-units` to check faction ownership when producing a mech.

### `game_players.leaders` JSONB

No migration needed. The existing default `{"agent":"unlocked","commander":"locked","hero":"locked"}` is kept. Valid state values per leader type:

| Leader | States |
|--------|--------|
| agent | `"unlocked"` (ready) · `"exhausted"` |
| commander | `"locked"` · `"unlocked"` |
| hero | `"locked"` · `"unlocked"` · `"purged"` |

### Data file updates

- **`supabase/jsons/units.json`** — add `"faction": "<Faction Name>"` to each mech entry (~17 entries). Generic units omit the field.
- **`supabase/jsons/leaders.json`** — add an `"ability"` object to each of the 34 leader entries: either `{ effects: [...], exhausts_source, purges_source, trigger }` for DSL-expressible abilities or `{ handler: "<slug>", exhausts_source, purges_source, trigger }` for complex ones.

---

## Admin Import

### `admin-import-leaders` (new Edge Function)

Service-role gated. Body: `{ records: LeaderRecord[] }`.

Import sequence (matches existing import pattern — not atomic):
1. Delete all `ability_sources` rows where `source_type='leader'`, then all `leaders` rows.
2. Insert new `leaders` rows; capture returned `id` values.
3. For each leader: insert `ability_definitions` row (handler or effects, exhausts_source, purges_source, trigger); insert `ability_sources` row (`source_type='leader'`, `source_id=leader.id`).

### `importSchemas.js` + `AdminDashboard.jsx`

Add a `leaders` entry to `importSchemas.js` with field descriptors. Add `leaders` to the importable table list in `AdminDashboard.jsx` (making it 13 tables).

---

## DSL Expansion (`_shared/abilityDsl.ts`)

The following ops move from the no-op block to fully implemented:

| Op | Params | Effect |
|----|--------|--------|
| `gain_command_tokens` | `amount: number` | Increment `command_tokens.tactic_total` by `amount`; DB CHECK constraint still enforces the 16-token cap |
| `convert_commodities` | `amount: number \| "all"` | `trade_goods += min(commodities, amount); commodities -= min(commodities, amount)` |
| `gain_technology` | `tech_name: string` | Append tech name to `player.technologies` array if not already present |
| `give_trade_goods` | `amount: number` | Transfer N TGs from activating player to `targetPlayerId` |
| `target_draw_action_card` | _(none)_ | Run `draw_action_card` logic for `targetPlayerId` |
| `replenish_commodities` | _(none)_ | Set `commodities` to player's faction commodity max (requires faction join) |

`ResolveContext` gains one new optional field: `targetSystemKey?: string` (for spatial abilities; not consumed by any DSL op in Phase 16 but avoids a context-breaking change later).

Leaders whose abilities are fully expressible via the above ops (expected ~10–14 of 34) will execute mechanically. The remainder get named handler stubs that are async no-ops.

---

## Backend Edge Functions

### `game-resolve-ability` (modify)

Add a `source_type='leader'` branch in the side-effects block (step 6, after ability resolution):

```
if source_type === 'leader' and source_id provided:
  fetch leader row; check leader_type
  if exhausts_source and leader_type === 'agent':
    update game_players.leaders → { ...leaders, agent: 'exhausted' }
  if purges_source and leader_type === 'hero':
    update game_players.leaders → { ...leaders, hero: 'purged' }
  // commanders: exhausts_source = false, purges_source = false — no state change (LRR §51.7)
```

### `game-unlock-commander` (already exists — now unblocked)

No code changes required. The function works correctly once the `leaders` table exists.

### `game-unlock-hero` (new)

Body: `{ game_id, leader_id }`.

1. AUTH + PLAYER
2. Fetch leader row; 404 if missing; 400 if `leader_type !== 'hero'`
3. If `player.leaders.hero !== 'locked'` → 409 'Hero already unlocked or purged'
4. Count player's scored objectives (public + secret; same logic as commander unlock)
5. If count < 3 → 409 'Unlock condition not met'
6. Update `game_players.leaders` → `{ ...leaders, hero: 'unlocked' }`
7. OK({ unlocked: true })

### `game-produce-units` (modify)

When any unit being produced has `unit_type = 'mech'` (determined by joining the `units` reference table):
1. Confirm `units.faction === player.faction`; if not → 409 'Mech does not belong to your faction'
2. Count existing mech units for this player across all systems in `game_player_units`; if count >= 2 → 409 'Mech component limit reached'

### `game-advance-phase` (modify)

During the Status Phase "Ready Cards" step: for each player in the game, if `leaders.agent === 'exhausted'`, update `game_players.leaders → { ...leaders, agent: 'unlocked' }`. Commanders don't exhaust; purged heroes cannot ready.

---

## UI Components

### `useLeaders.js` (new hook)

Fetches `leaders` reference rows filtered to `currentPlayer.faction`. Exposes:
- `leaders` — `{ agent, commander, hero }` reference rows (name, text, unlock_criteria)
- `leaderStatus` — `currentPlayer.leaders` JSONB values
- `factionMech` — the player's mech unit row (`unit_type='mech'`, `faction=player.faction`)
- Dispatchers: `exhaustAgent()`, `unlockCommander(abilityDefinitionId)`, `unlockHero(leaderId)`, `triggerLeaderAbility(abilityDefinitionId, leaderId, selections)`

### `LeaderCard.jsx` (new)

Renders a single leader (or mech) card. Shows name, type badge, ability text, status chip, unlock criteria when locked. Action buttons per state:

| Leader | State | Button |
|--------|-------|--------|
| Agent | unlocked | "Use Ability" → trigger flow |
| Agent | exhausted | disabled |
| Commander | locked | "Check Unlock" → `game-unlock-commander` |
| Commander | unlocked | none (passive) |
| Hero | locked | "Check Unlock" → `game-unlock-hero` |
| Hero | unlocked | "Use Ability" → trigger flow (purges on resolution) |
| Hero | purged | greyed out card |
| Mech | — | no buttons; shows cost, combat, sustain, abilities |

### `LeaderPanel.jsx` (new)

`PANEL(lg)` containing 4 `LeaderCard` components in a 2×2 grid (agent, commander, hero, mech). Rendered as a tab inside `MyPanelSection`.

### `MyPanelSection.jsx` (modify)

Add a Leaders tab that renders `LeaderPanel`.

### `GameScreen.jsx` (modify)

Populate the `leaderIds` slot in `playerSources` (currently hardcoded `[]`) using the `ability_sources` IDs for the player's three leaders. This feeds the existing `useAbilities` hook so leader abilities surface as triggerable/unlockable.

---

## File List

| File | Status |
|------|--------|
| `supabase/migrations/033_leaders.sql` | New |
| `supabase/jsons/units.json` | Data update |
| `supabase/jsons/leaders.json` | Data update |
| `supabase/functions/admin-import-leaders/index.ts` | New |
| `src/lib/importSchemas.js` | Modify |
| `src/components/admin/AdminDashboard.jsx` | Modify |
| `supabase/functions/_shared/abilityDsl.ts` | Modify |
| `supabase/functions/game-resolve-ability/index.ts` | Modify |
| `supabase/functions/game-unlock-hero/index.ts` | New |
| `supabase/functions/game-produce-units/index.ts` | Modify |
| `supabase/functions/game-advance-phase/index.ts` | Modify |
| `src/lib/edgeFunctions.js` | Modify |
| `src/hooks/useLeaders.js` | New |
| `src/components/game/LeaderCard.jsx` | New |
| `src/components/game/LeaderPanel.jsx` | New |
| `src/components/game/MyPanelSection.jsx` | Modify |
| `src/components/game/GameScreen.jsx` | Modify |

---

## Deferred (POTENTIAL_TODOS entries)

- **Deploy abilities via ability DSL** — `place_units` op is still no-op; mech Deploy abilities (e.g., "place 1 mech on a planet when X") are handler stubs until `place_units` is wired to `game_player_units` in Phase 19.
- **Titans of Ul hero** — attaches to Elysium rather than being purged; requires planet attachment logic (Phase 17).
- **Nomad extra agents** — "The Company" ability grants 2 additional agents; requires special-casing in import and status tracking.
- **Commander passive triggers** — commanders that trigger on opponent actions (e.g., during the active player's turn) require server-side event hooks not yet designed.
- **Alliance promissory note + commander sharing** — commander ability available to the holder of the Alliance note; requires cross-player ability resolution.
- **`modify_roll` / `add_die` / `cancel_hit`** for leaders — still no-op until combat hook system is built (Phase 20).
