# Ability System Design

**Date:** 2026-04-17
**Goal:** A unified trigger/timing/modifier system that covers all card abilities and leader unlock criteria across every source in the game — action cards, leaders, relics, faction abilities, promissory notes, exploration cards, and technologies — with full automated resolution.

---

## Architecture Overview

Three layers:

1. **Data** — `ability_definitions` + `ability_sources` tables hold every ability as structured data (trigger + composable effect ops, or a named handler for complex cases).
2. **Pipeline** — client-side hooks (`useGameEvents`, `useAbilities`) surface playable abilities in real time; `game-resolve-ability` Edge Function validates and executes them server-side.
3. **UI** — existing components (ActionCardModal, MyPanelSection) gain contextual PLAY states; new components (AbilityNotificationBar, AbilityTargetModal) handle reactive abilities and target selection.

---

## Data Model

### `ability_definitions`

One row per distinct ability. Cards sharing an ability (e.g. all dreadnoughts share Direct Hit immunity) share a single row linked through `ability_sources`.

```sql
CREATE TABLE ability_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_name      TEXT NOT NULL,
  trigger           JSONB NOT NULL,
  unlock_conditions JSONB,          -- commanders only; evaluated passively
  effects           JSONB,          -- composable DSL ops array
  handler           TEXT,           -- named escape hatch for complex effects
  exhausts_source   BOOLEAN NOT NULL DEFAULT false,
  purges_source     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT effects_or_handler CHECK (
    (effects IS NOT NULL) != (handler IS NOT NULL)
  )
);
```

### `ability_sources`

Many-to-many: one ability can be shared by many cards; one card can have many abilities.

```sql
CREATE TABLE ability_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ability_id   UUID NOT NULL REFERENCES ability_definitions(id),
  source_type  TEXT NOT NULL CHECK (source_type IN (
    'action_card', 'leader', 'relic', 'faction_ability',
    'promissory_note', 'exploration_card', 'technology'
  )),
  source_id    UUID,        -- null when source_type = 'faction_ability'
  faction_name TEXT         -- set when source_type = 'faction_ability'
);

-- Two partial indexes instead of one UNIQUE constraint:
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints, so a single
-- UNIQUE(ability_id, source_type, source_id) would allow duplicate faction_ability rows.
CREATE UNIQUE INDEX ability_sources_by_card    ON ability_sources (ability_id, source_type, source_id)    WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX ability_sources_by_faction ON ability_sources (ability_id, source_type, faction_name) WHERE faction_name IS NOT NULL;
```

**Key decisions:**
- `expansion` is omitted — derive it from the source card when needed.
- `effects` and `handler` are mutually exclusive (enforced by CHECK constraint).
- `unlock_conditions` is only meaningful for `leader` sources with `leader_type = 'commander'`.
- The activating player must pass `source_id` at resolution time so the engine knows which specific card to exhaust or purge.

---

## Trigger Taxonomy

A trigger has three parts:

```json
{
  "event": "SHIP_DESTROYED",
  "owner": "self",
  "conditions": [
    { "check": "combat_type", "value": "space" }
  ]
}
```

**`owner`**: `"self"` | `"other"` | `"any"` — distinguishes "when *you* gain trade goods" from "when *another player* gains trade goods".

**`PASSIVE`** is a special event meaning "always active while the source is held" (Crown of Thalnos, Sustain Damage, etc.).

### Full Event List

| Category | Event | Example |
|---|---|---|
| **Phase** | `STRATEGY_PHASE_START` | Scepter of Dominion |
| | `ACTION_PHASE_START` | — |
| | `STATUS_PHASE_START` | Versatile (Sol) |
| | `AGENDA_PHASE_START` | Ancient Burial Sites, Maw of Worlds |
| **Player action** | `PLAYER_ACTION` | All "ACTION:" cards |
| | `TACTICAL_ACTION_START` | Dominus Orb |
| | `TACTICAL_ACTION_COMPLETE` | Crown of Emphidia |
| | `STRATEGIC_ACTION_START` | Coup D'etat |
| | `STRATEGIC_ACTION_SECONDARY` | Jae Mir Kan |
| **Combat** | `SPACE_COMBAT_START` | Ambush (Mentak), Antivirus |
| | `COMBAT_ROUND` | Crown of Thalnos |
| | `COMBAT_ROUND_END` | Devotion (Yin) |
| | `GROUND_COMBAT_START` | Indoctrination (Yin) |
| | `INVASION_START` | Bunker |
| | `SHIP_DESTROYED` | Courageous to the End |
| | `HIT_PRODUCED` | Tellurian (Titans) |
| | `UNIT_ABILITY_ROLL` | Trrakan Aun Zulok (Argent) — general catch-all |
| | `BOMBARDMENT_ROLL` | Bunker — targeted roll modifier |
| | `SPACE_CANNON_ROLL` | Ul hero attachment |
| | `AFB_ROLL` | Targeted AFB modifier |
| | `SUSTAIN_DAMAGE_USED` | — |
| **Retreat** | `RETREAT_DECLARED` | Cards that fire on retreat announcement |
| | `RETREAT_COMPLETED` | After ships move to destination |
| **Agenda** | `AGENDA_REVEALED` | Construction Rider |
| | `AGENDA_SPEAKER_VOTED` | Bribery |
| | `AGENDA_ELECTED` | Confounding / Confusing Legal Text |
| **Economy** | `TRADE_GOODS_GAINED` | Pillage (Mentak) |
| | `TRANSACTION_RESOLVED` | Pillage (Mentak) |
| | `COMMAND_TOKEN_SPENT` | Scepter of Emelpar |
| **Unit abilities** | `PRODUCTION_USED` | Tungstantus (Titans) |
| | `FACTION_ABILITY_USED` | Orbital Drop (Sol) — condition narrows by name |
| **Research** | `TECHNOLOGY_RESEARCHED` | Nekro Acidos, Prophet's Tears |
| **Ownership** | `CARD_RECEIVED` | Support for the Throne, Shard of the Throne |
| **Passive** | `PASSIVE` | Crown of Thalnos, Sustain Damage |

### Condition Checks

```json
{ "check": "combat_type",   "value": "space|ground" }
{ "check": "unit_type",     "in": ["cruiser", "destroyer"] }
{ "check": "ability_name",  "value": "Orbital Drop" }
{ "check": "tech_color",    "value": "green|blue|red|yellow" }
{ "check": "planet_trait",  "value": "cultural|hazardous|industrial" }
{ "check": "neighbor",      "value": true }
{ "check": "vp_count",      "gte": 3 }
```

### Unlock Conditions (commanders only)

Stored in `unlock_conditions` JSONB, evaluated passively whenever game state changes:

```json
[
  { "check": "scored_objectives", "gte": 3 }
]
```

```json
[
  { "check": "structures_on_board", "gte": 5 }
]
```

```json
[
  { "check": "other_faction_tokens_in_fleet_pool", "gte": 2 }
]
```

---

## Effect DSL

`effects` is a JSONB array of ops executed in sequence by the DSL interpreter. A shared context object carries bound values between steps.

### Op Categories

**Resources**
```json
{ "op": "gain_trade_goods",    "amount": 1 }
{ "op": "spend_trade_goods",   "amount": "chosen_amount" }
{ "op": "gain_commodities",    "amount": 2 }
{ "op": "convert_commodities", "amount": 2, "to": "trade_goods" }
{ "op": "gain_command_tokens", "amount": 1, "pool": "any" }
```

**Cards**
```json
{ "op": "draw_action_card",   "amount": 1 }
{ "op": "draw_secret_objective" }
{ "op": "take_from_discard",  "card_type": "action_card", "amount": 3 }
```

**Planets**
```json
{ "op": "exhaust_planets", "filter": { "trait": "cultural" }, "target": "chosen_player" }
{ "op": "explore_planet",  "target": "chosen_planet" }
```

**Units**
```json
{ "op": "place_units",   "unit_type": "infantry", "amount": 2, "location": "chosen_planet" }
{ "op": "destroy_units", "location": "chosen_planet", "owner": "any" }
```

**Victory Points**
```json
{ "op": "gain_vp", "amount": 1 }
{ "op": "lose_vp", "amount": 1 }
```

**Technology**
```json
{ "op": "gain_technology",     "filter": "any" }
{ "op": "gain_technology",     "filter": { "matches_specialty": "chosen_planet" } }
{ "op": "ignore_prerequisite", "amount": 1 }
```

**Roll Modifiers** (used with `PASSIVE` or mid-combat triggers)
```json
{ "op": "modify_roll", "event": "BOMBARDMENT_ROLL", "modifier": -4 }
{ "op": "add_die",     "event": "UNIT_ABILITY_ROLL" }
{ "op": "cancel_hit" }
```

**Votes**
```json
{ "op": "cast_votes",   "amount": "chosen_amount", "per": "trade_good_spent" }
{ "op": "prevent_vote" }
```

### Sequences and Bound Values

Ops run in order and share a context. `"chosen_amount"` is bound once by the player and reused across all ops that reference it:

```json
[
  { "op": "spend_trade_goods", "amount": "chosen_amount" },
  { "op": "cast_votes",        "amount": "chosen_amount" }
]
```

### Branching Choices

`choose_one` presents options; the player picks one path:

```json
{
  "op": "choose_one",
  "options": [
    { "op": "ignore_prerequisite", "amount": 1 },
    { "op": "draw_action_card",    "amount": 1 }
  ]
}
```

### `target` Values

| Value | Meaning |
|---|---|
| `"self"` | The activating player |
| `"chosen_player"` | Player selects a target player at activation time |
| `"active_player"` | The player currently taking their turn |
| `"chosen_planet"` | Player selects a planet at activation time |
| `"any"` | Applies regardless of ownership |

### Named Handlers (escape hatch)

Effects that mutate ongoing resolution state or require game-engine-level context are not expressible as composable ops. These use `"handler": "<name>"` instead of `"effects"`. They are still fully automated — just code-defined rather than data-defined. Examples:

| Handler name | Card | Reason |
|---|---|---|
| `confounding_legal_text` | Confounding Legal Text | Redirects elected player mid-resolution |
| `coup_detat` | Coup D'etat | Cancels an in-progress strategic action |
| `airo_shir_aur` | Airo Shir Aur (Mahact hero) | Complex cross-system unit movement |
| `ul_the_progenitor` | Ul the Progenitor (Titans hero) | Attaches card to a specific planet permanently |

All handlers receive `(selections, gameContext)` and return a list of DB mutations — same contract as the DSL interpreter output.

---

## Resolution Pipeline

### Stage 1 — Event Emission: `useGameEvents`

Watches existing game state from `useGame` and maps transitions to typed event objects:

- **Reactive** — phase changes via Realtime emit phase events automatically.
- **Explicit** — action wrappers (`endTheTurn`, `passTheAction`, etc.) emit the corresponding event before calling the Edge Function.
- **Combat** — combat state fields on `game` or `game_system_state` emit combat events.

Returns `currentEvent: GameEvent | null`.

### Stage 2 — Ability Surfacing: `useAbilities`

```javascript
const { triggerable, unlockable } = useAbilities(
  currentEvent,
  playerSources,         // shape: { actionCardIds, factionName, leaderIds, relicIds, promissoryNoteIds }
  allAbilityDefinitions  // loaded once at game start via supabase.from('ability_definitions').select('*, ability_sources(*)')
)
```

Filtering is pure client-side:
1. Match `trigger.event` against `currentEvent.type`
2. Check `trigger.owner` against who triggered the event
3. Evaluate `trigger.conditions` against current game state snapshot

`unlockable` — commanders whose `unlock_conditions` are satisfied — is checked independently whenever game state changes.

### Stage 3 — Activation: Target Selection UI

When the player taps PLAY on a triggerable ability, the UI inspects the ops for required inputs:

| Op field | UI presented |
|---|---|
| `"target": "chosen_player"` | Player picker |
| `"target": "chosen_planet"` | Planet picker |
| `"amount": "chosen_amount"` | Number input |
| `"op": "choose_one"` | Option selector |

Once all selections are collected, the client calls the server:

```typescript
// POST game-resolve-ability
{
  game_id:               string,
  ability_definition_id: string,
  source_type:           string,
  source_id:             string,
  selections: {
    chosen_player?:  string,
    chosen_planet?:  string,
    chosen_amount?:  number,
    chosen_option?:  number   // index into choose_one options
  }
}
```

### Stage 4 — Server Execution: `game-resolve-ability`

```
1. Load ability_definition row
2. Re-validate trigger conditions against live DB state
   → 409 if stale (conditions no longer hold)
3. Dispatch:
   a. effects present → DSL interpreter (ops → DB mutations)
   b. handler present → named handler module (code → DB mutations)
4. Apply source side-effects:
   exhausts_source → update card/leader to 'exhausted'
   purges_source   → mark card as 'purged' or delete row
5. Return { resolved: true }
```

Commander unlocking follows a lighter path: client detects conditions met → prompts player → `game-unlock-commander` Edge Function re-validates and flips `leaders.commander` to `'unlocked'`.

---

## Client Integration

### Hook placement in `GameScreen`

```javascript
const { currentEvent } = useGameEvents(game, players, currentPlayer)
const { triggerable, unlockable } = useAbilities(currentEvent, playerSources, allAbilityDefinitions)
const [activatingAbility, setActivatingAbility] = useState(null)
```

### Updated components

**`ActionCardModal`**
- Cards in `triggerable` gain a "PLAY" primary button (calls `game-resolve-ability` via `setActivatingAbility`).
- All cards retain "DISCARD" (calls existing `game-discard-action-card`).
- Cards not in `triggerable` show no "PLAY" button — discard only.

**`MyPanelSection`**
- New **Faction Abilities** sub-section: ACTION-timed abilities shown as buttons (enabled when triggerable, dimmed otherwise); passive abilities shown as static text.
- Existing **Leaders** section gains states: `locked` (greyed, shows unlock criteria text), `unlockable` (highlighted, UNLOCK button), `active` (USE button), `exhausted` (dimmed).

### New components

**`AbilityNotificationBar`** — slim persistent bar above `MyPanelSection`. Surfaces time-sensitive reactive abilities (Coup D'etat, Bribery, Bunker, etc.) with PLAY and DISMISS actions. Disappears when the triggering event window closes.

```
┌──────────────────────────────────────────────────────────┐
│ ⚡ BRIBERY playable — agenda vote in progress  [PLAY] [DISMISS] │
└──────────────────────────────────────────────────────────┘
```

**`AbilityTargetModal`** — shared modal rendered once in `GameScreen`, driven by `activatingAbility` state. Collects all player selections required by the ops, then calls `game-resolve-ability`. Handles all target types: player picker, planet picker, number input, option selector.

### Component tree

```
GameScreen
├── useGameEvents  →  currentEvent
├── useAbilities   →  triggerable, unlockable
│
├── GameHeader
├── AbilityNotificationBar          ← new
├── ScoreboardSection
├── MyPanelSection
│     ├── FactionAbilitiesSection   ← new sub-section
│     └── LeaderSection             (updated: unlock states)
├── ObjectivesSection
├── HostControlsSection
│
├── ActionCardModal                 (updated: PLAY vs DISCARD)
├── TechTreeModal
└── AbilityTargetModal              ← new
```

---

## New Edge Functions

| Function | Purpose |
|---|---|
| `game-resolve-ability` | Validates trigger, executes DSL ops or named handler, applies exhaust/purge |
| `game-unlock-commander` | Validates unlock conditions, flips leader to `'unlocked'` |

---

## New Admin Import Tables

`ability_definitions` and `ability_sources` need admin import support (JSON paste form + Edge Functions) consistent with the existing 12 import tables.

---

## Out of Scope

- Encoding every card in the game into `ability_definitions` — this is a data entry effort separate from building the system.
- Multi-player reactive windows (e.g. priority ordering when two players can both respond to the same event) — deferred.
- Undo/replay of resolved abilities — deferred.
