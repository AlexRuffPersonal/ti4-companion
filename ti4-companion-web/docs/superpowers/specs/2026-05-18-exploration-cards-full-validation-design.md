# Exploration Cards Full Validation — Design Spec

**Date:** 2026-05-18
**Phase:** 39 (Exploration Full Validation)

---

## Context

Phase 17 built the exploration framework (draw/resolve pipeline, abilityDsl dispatch, ExplorationModal UI). An audit of the live code against `exploration-cards.json` and the TI4 LRR §35 revealed six data-corrupting bugs and four cards with missing or wrong game logic.

### Rules basis (LRR §35)

- §35.2: Player draws and resolves a card from the matching exploration deck.
- §35.7: After resolving, the card is discarded unless it is a relic fragment or attachment.
- §35.8: Attachment cards are attached to the explored planet.
- §35.9: Relic fragment cards are placed faceup in the player's play area.

---

## Bug Audit

### Critical (silent data corruption or hard errors in live play)

| Card | Bug | Root cause |
|------|-----|-----------|
| Gamma Relay, Gamma Wormhole, Ion Storm | `place_map_token` writes to wrong system | `systemKey` hardcoded `null` (line 198, `game-resolve-exploration-card/index.ts`) |
| Mirage | Returns HTTP 409 | Explicitly stubbed: `return errorResponse('Mirage placement not yet implemented', 409)` |
| Expedition | `ready_planets` op silently no-ops | DSL reads `context.selections.planet_names`; effect uses `planets:'self'` which is never wired |
| Merchant Station | Corrupts commodities/trade_goods | `amount:'max'` and `amount:'all'` cast to `NaN` in `resolveAmount` |
| Volatile Fuel Source | Writes to `tokens['undefined']` | `gain_command_tokens` reads `op.bucket`; effect omits `bucket` |
| Functioning Base, Local Fabricators | Commodity-spend path missing | Option B only handles TG spend; card text allows "trade good **or** commodity" |

### Missing game logic

| Card | Missing behaviour |
|------|------------------|
| Demilitarized Zone | Immediate effect (remove structures + ground forces) not applied on draw; no ongoing mech-placement enforcement |
| Tomb Of Emphidia | Attachment placed but Crown of Emphidia relic not searched/granted |
| Enigmatic Device | ACTION ability (spend 6 resources → purge → research 1 tech) unimplemented |
| Freelancers | `place_units` op uses wrong field names (`unit:'any'`, `planet:'self'`); no resource payment |

---

## Design

### 1. Schema (`migrations/035_exploration_fixes.sql`)

```sql
ALTER TABLE game_exploration_decks ADD COLUMN system_key TEXT;
ALTER TABLE game_system_state ADD COLUMN has_mirage BOOLEAN NOT NULL DEFAULT false;
```

`system_key` is populated at draw time so `game-resolve-exploration-card` knows which system the card came from. `has_mirage` lets the UI render the Mirage planet token in the hex.

---

### 2. `game-explore-planet` and `game-explore-frontier` — store `system_key`

Both functions update the drawn card row. Each adds `system_key` to that update:

- **`game-explore-planet`**: derives `system_key` from the planet-to-tile lookup already performed for trait validation.
- **`game-explore-frontier`**: `system_key` is already in the request body (player activates a specific system tile).

---

### 3. `explorationEffects.ts` — nine entry fixes

#### `Expedition`
```ts
[{ op:'conditional_mech_or_infantry', effect:[{op:'ready_current_planet'}] }]
```
New `ready_current_planet` op in exploration dispatch uses `ctx.planetName` directly.

#### `Merchant Station`
```ts
[{ op:'choice', options:[
  [{op:'replenish_commodities', target:'self'}],
  [{op:'convert_all_commodities'}]
]}]
```
`replenish_commodities` already exists in abilityDsl. `convert_all_commodities` is new.

#### `Volatile Fuel Source`
```ts
[{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_token_choice'}] }]
```
New `gain_command_token_choice` op reads bucket from `context.selections.command_token_bucket` (new optional body param, defaults to `'tactic_total'`).

#### `Functioning Base` — 3-way flat choice
```ts
[{ op:'choice', options:[
  [{op:'gain_commodities', amount:1}],
  [{op:'spend_trade_goods', amount:1}, {op:'draw_action_card', count:1}],
  [{op:'spend_commodities', amount:1}, {op:'draw_action_card', count:1}]
]}]
```

#### `Local Fabricators` — 3-way flat choice
```ts
[{ op:'choice', options:[
  [{op:'gain_commodities', amount:1}],
  [{op:'spend_trade_goods', amount:1}, {op:'place_mech_on_current_planet'}],
  [{op:'spend_commodities', amount:1}, {op:'place_mech_on_current_planet'}]
]}]
```

#### `Demilitarized Zone`
```ts
[
  {op:'clear_planet_units_and_structures'},
  {op:'attach_to_planet', attachment:'Demilitarized Zone'}
]
```
`clear_planet_units_and_structures` is handled in exploration dispatch (requires `ctx.planetName`).

#### `Tomb Of Emphidia`
```ts
[
  {op:'attach_to_planet', attachment:'Tomb Of Emphidia'},
  {op:'gain_named_relic', name:'Crown of Emphidia'}
]
```
`gain_named_relic` searches `game_relic_deck` by name and sets the matching row to `state='held'`.

#### `Enigmatic Device`
```ts
[{op:'hold_card'}]
```
No longer treated as a relic fragment. `hold_card` sets `signalType='hold'` so the card ends up `state='held'`. ACTION handled by new `game-use-enigmatic-device` function.

#### `Freelancers`
```ts
[{op:'freelancers_produce'}]
```
Bespoke op in exploration dispatch. Optional: if `body.unit_type` is absent the player skips production.

---

### 4. `abilityDsl.ts` — three new ops

#### `convert_all_commodities`
```
count = player.commodities
if count > 0:
  update player SET commodities=0, trade_goods=trade_goods+count
```

#### `spend_commodities`
```
if player.commodities < op.amount: ERR 'Insufficient commodities'
update player SET commodities=commodities-op.amount
```

#### `gain_command_token_choice`
```
bucket = context.selections.command_token_bucket ?? 'tactic_total'
validate bucket IN ['tactic_total','fleet','strategy']
tokens[bucket] += 1
update player SET command_tokens=tokens
```

---

### 5. `game-resolve-exploration-card` — dispatcher fixes

**`systemKey`:** replace `const systemKey: string | null = null` with `const systemKey = card.system_key ?? null`.

**New optional body params:**
- `command_token_bucket: 'tactic_total' | 'fleet' | 'strategy'`
- `unit_type: string` (Freelancers)
- `resource_planet_names: string[]` (Freelancers)

**New dispatch cases:**

`ready_current_planet`:
```
update game_player_planets SET exhausted=false
WHERE game_id + player_id + planet_name=ctx.planetName
```

`clear_planet_units_and_structures`:
```
update game_player_planets SET space_dock_unit_id=null, pds_count=0
WHERE game_id + player_id + planet_name=ctx.planetName
delete from game_player_units
WHERE game_id + player_id + on_planet=ctx.planetName
```

`hold_card` → returns signal `'hold'`.

`gain_named_relic`:
```
find game_relic_deck WHERE game_id + name=op.name + state='deck'
if found: update state='held', held_by_player_id=player_id
// silently skip if already drawn or absent
```

`freelancers_produce`:
```
if !ctx.unitType: return 'handled'  // player skipped (optional)
fetch unit definition for unit_type → cost
fetch game_player_planets WHERE game_id + player_id + planet_name IN resource_planet_names
ERR 409 if any planet not found or already exhausted
totalSpend = sum(planet.resources) + sum(planet.influence)  // influence counts as resources
ERR 409 'Insufficient resources' if totalSpend < cost
exhaust all chosen planets
upsert game_player_units: unit_type, system_key=ctx.systemKey, on_planet=null, count+1
// Note: bypasses fleet-pool and capacity checks — exploration production does not require
// system activation, so normal fleet limits do not apply (LRR §35.2).
```

`place_mech_on_current_planet`:
```
// TI4: max 1 mech per planet
existing = fetch game_player_units WHERE game_id + player_id
           + unit_type='mech' + on_planet=ctx.planetName
ERR 409 'Planet already has a mech' if existing and existing.count >= 1
upsert game_player_units: unit_type='mech', system_key=ctx.systemKey,
       on_planet=ctx.planetName, count=1
```

`place_mirage`:
```
upsert game_system_state SET has_mirage=true WHERE game_id + system_key=ctx.systemKey
insert game_player_planets: game_id, player_id, planet_name='Mirage',
       system_key=ctx.systemKey, exhausted=false
return 'purge'
```

**Dispatch signal union** — extend `dispatchExplorationOp` return type from
`'handled' | 'passthrough' | 'relic_fragment' | 'attachment' | Response`
to also include `'hold' | 'purge'`.

**Final state machine** (extended):
- `signalType='relic_fragment'` → `state='held'`
- `signalType='hold'` → `state='held'` (Enigmatic Device)
- `signalType='purge'` → `state='purged'` (Mirage, Gamma Relay, Gamma Wormhole)
- otherwise → `state='discarded'`

`purge` signal: raised when any op in the chain returns the string `'purge'`.

---

### 6. `game-use-enigmatic-device` — new edge function

**File:** `supabase/functions/game-use-enigmatic-device/index.ts`

**Request body:** `{ game_id, player_id, card_id, resource_planet_names: string[], technology_name: string }`

```
AUTH; CORS; validate all required fields

fetch game_exploration_decks WHERE id=card_id + game_id
ERR 404 'Card not found'
ERR 409 'Card not in held state' if state != 'held'
ERR 409 'Not your card' if resolved_by_player_id != player_id
ERR 409 'Card is not an Enigmatic Device' if name != 'Enigmatic Device'

fetch game_player_planets WHERE game_id + player_id + planet_name IN resource_planet_names
ERR 409 if any planet not found or exhausted
totalResources = sum(planet.resources)
ERR 409 'Insufficient resources (need 6)' if totalResources < 6

// Research technology (prereq check included)
applyAbility([{op:'gain_technology'}], context{selections:{technology_name}}, db)

// Exhaust chosen planets
update game_player_planets SET exhausted=true
WHERE game_id + player_id + planet_name IN resource_planet_names

// Purge card
update game_exploration_decks SET state='purged', resolved_by_player_id=null
WHERE id=card_id

OK({ technology: technology_name })
```

---

### 7. `game-land-troops` — Demilitarized Zone mech enforcement

After planet ownership validation, before unit placement, add:

```
if unit_type === 'mech':
  fetch game_player_planets WHERE game_id + player_id + planet_name
  if planet.attachments is non-empty:
    fetch attachment names WHERE id IN planet.attachments
    ERR 409 'Cannot place a mech on a Demilitarized Zone planet'
        if 'Demilitarized Zone' in attachment names
```

---

## Files Changed

| File | Type |
|------|------|
| `supabase/migrations/035_exploration_fixes.sql` | New |
| `supabase/functions/_shared/explorationEffects.ts` | Modify |
| `supabase/functions/_shared/abilityDsl.ts` | Modify |
| `supabase/functions/game-resolve-exploration-card/index.ts` | Modify |
| `supabase/functions/game-explore-planet/index.ts` | Modify |
| `supabase/functions/game-explore-frontier/index.ts` | Modify |
| `supabase/functions/game-use-enigmatic-device/index.ts` | New |
| `supabase/functions/game-land-troops/index.ts` | Modify |
